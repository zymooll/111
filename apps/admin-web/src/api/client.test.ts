import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi, adminRefreshTokenKey, adminTokenKey, onSessionExpired } from './client';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authorizationOf(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers).get('Authorization');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('admin HTTP adapter', () => {
  it('normalizes the FastAPI admin login response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'admin-access-token',
      refresh_token: 'admin-refresh-token',
      user: { id: 'admin-1', username: 'admin', role: 'super_admin' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adminApi.login('admin', 'Admin123!');

    expect(result).toMatchObject({
      accessToken: 'admin-access-token',
      refreshToken: 'admin-refresh-token',
      user: { id: 'admin-1', username: 'admin', role: 'super_admin' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:7993/admin/api/v1/auth/login');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      identifier: 'admin',
      password: 'Admin123!',
    });
  });

  it('normalizes dashboard counters and recent reviews', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        users: 12,
        active_merchants: 5,
        active_menu_items: 18,
        pending_reviews: 3,
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          id: 'review-1',
          user_id: 'user-1',
          username: '同学甲',
          menu_item_name: '番茄牛腩饭',
          merchant_name: '校园小炒',
          rating: 5,
          text: '味道很好',
          images: [],
          status: 'pending_manual',
          risk_level: 'medium',
          created_at: '2026-07-18T04:00:00Z',
        }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adminApi.dashboard();

    expect(result).toMatchObject({
      users: 12,
      merchants: 5,
      menuItems: 18,
      pendingReviews: 3,
    });
    expect(result.recentReviews[0]).toMatchObject({
      id: 'review-1',
      userName: '同学甲',
      itemName: '番茄牛腩饭',
      status: 'pending_manual',
      riskLevel: 'medium',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/dashboard?campus_id=00000000-0000-0000-0000-000000000001');
  });

  it('reads cursor-backed merchant pages from the campus-scoped admin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{
        id: 'merchant-1',
        campus_id: '00000000-0000-0000-0000-000000000001',
        name: '校园小炒',
        address: '北区食堂',
        latitude: 31.23,
        longitude: 121.47,
        price_level: 2,
        business_hours: '10:00-20:00',
        is_active: true,
      }],
      next_cursor: null,
      has_more: false,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adminApi.merchants({ limit: 10 });

    expect(result).toMatchObject({
      hasMore: false,
      nextCursor: null,
      items: [expect.objectContaining({ id: 'merchant-1', campusId: '00000000-0000-0000-0000-000000000001', status: 'online' })],
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/merchants?campus_id=00000000-0000-0000-0000-000000000001');
  });

  it('walks review pages with the server cursor and never sends an offset', async () => {
    const page = (id: string, nextCursor: string | null) => jsonResponse({
      items: [{ id, status: 'pending_manual', rating: 4, text: '演示', images: [], risk_level: 'medium' }],
      total: 42,
      next_cursor: nextCursor,
      has_more: nextCursor !== null,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page('review-1', 'cursor-2'))
      .mockResolvedValueOnce(page('review-2', null));
    vi.stubGlobal('fetch', fetchMock);

    const first = await adminApi.reviews({ status: 'pending_manual', limit: 10 });
    const second = await adminApi.reviews({ status: 'pending_manual', limit: 10, cursor: first.nextCursor });

    expect(first).toMatchObject({ nextCursor: 'cursor-2', hasMore: true, total: 42 });
    expect(first.items[0].id).toBe('review-1');
    expect(second).toMatchObject({ nextCursor: null, hasMore: false, total: 42 });
    expect(second.items[0].id).toBe('review-2');

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain('status=pending_manual');
    expect(urls[0]).toContain('limit=10');
    expect(urls[0]).not.toContain('cursor=');
    expect(urls[1]).toContain('cursor=cursor-2');
    expect(urls.some((url) => url.includes('offset'))).toBe(false);
  });

  it('renews the access token once for concurrent 401s and replays both requests', async () => {
    sessionStorage.setItem(adminTokenKey, 'expired-access-token');
    sessionStorage.setItem(adminRefreshTokenKey, 'stored-refresh-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: '登录状态无效' }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: '登录状态无效' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ items: [], next_cursor: null, has_more: false })));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([adminApi.users({ limit: 10 }), adminApi.merchants({ limit: 10 })]);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ refresh_token: 'stored-refresh-token' });
    expect(sessionStorage.getItem(adminTokenKey)).toBe('fresh-access-token');
    expect(sessionStorage.getItem(adminRefreshTokenKey)).toBe('rotated-refresh-token');
    expect(authorizationOf(fetchMock.mock.calls[0])).toBe('Bearer expired-access-token');
    expect(authorizationOf(fetchMock.mock.calls[3])).toBe('Bearer fresh-access-token');
    expect(authorizationOf(fetchMock.mock.calls[4])).toBe('Bearer fresh-access-token');
  });

  it('clears the session and notifies listeners when renewal fails', async () => {
    sessionStorage.setItem(adminTokenKey, 'expired-access-token');
    sessionStorage.setItem(adminRefreshTokenKey, 'revoked-refresh-token');
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: '登录状态无效' }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: '刷新令牌已撤销' }, 401)));

    await expect(adminApi.auditLogs({ limit: 10 })).rejects.toThrow('登录状态已过期，请重新登录');

    expect(sessionStorage.getItem(adminTokenKey)).toBeNull();
    expect(sessionStorage.getItem(adminRefreshTokenKey)).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('surfaces FastAPI problem details instead of hiding 4xx errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      title: '请求参数校验失败',
      detail: '账号或密码错误',
      status: 401,
    }, 401)));

    await expect(adminApi.login('admin', 'wrong')).rejects.toThrow('账号或密码错误');
  });

  it('keeps failed writes visible while read-only data may degrade to demo content', async () => {
    vi.stubEnv('VITE_API_MODE', 'fallback');
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('后端不可达')));
    const { adminApi: degradable, isFallbackActive } = await import('./client');

    await expect(degradable.updateMerchantStatus('merchant-1', 'offline')).rejects.toThrow('后端不可达');
    await expect(degradable.merchants({ limit: 10 })).resolves.toMatchObject({ items: expect.any(Array) });
    expect(isFallbackActive()).toBe(true);
  });

  it('normalizes the campus tag dictionary and sends campus-scoped CRUD payloads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 'tag-1',
          campus_id: '00000000-0000-0000-0000-000000000001',
          name: '清淡',
          kind: 'taste',
          usage_count: 3,
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        id: 'tag-2',
        campus_id: '00000000-0000-0000-0000-000000000001',
        name: '低糖',
        kind: 'diet',
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        id: 'tag-2',
        campus_id: '00000000-0000-0000-0000-000000000001',
        name: '控糖',
        kind: 'diet',
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adminApi.tags()).resolves.toEqual([
      expect.objectContaining({ id: 'tag-1', name: '清淡', kind: 'taste', usageCount: 3 }),
    ]);
    await adminApi.saveTag({ name: '低糖', kind: 'diet' });
    await adminApi.saveTag({ id: 'tag-2', name: '控糖', kind: 'diet' });
    await adminApi.deleteTag('tag-2');

    expect(fetchMock.mock.calls[0][0]).toContain('/tags?campus_id=00000000-0000-0000-0000-000000000001');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      campus_id: '00000000-0000-0000-0000-000000000001',
      name: '低糖',
      kind: 'diet',
    });
    expect(fetchMock.mock.calls[2][0]).toContain('/tags/tag-2');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ name: '控糖', kind: 'diet' });
    expect(fetchMock.mock.calls[3][1]?.method).toBe('DELETE');
  });

  it('submits only the picked WGS-84 coordinates and leaves the GCJ-02 pair to the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'merchant-map-1',
      campus_id: '00000000-0000-0000-0000-000000000001',
      name: '地图选点商家',
      address: '北区食堂',
      latitude: 31.2312,
      longitude: 121.4758,
      price_level: 2,
      business_hours: '10:00-20:00',
      is_active: false,
    }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await adminApi.saveMerchant({
      name: '地图选点商家',
      address: '北区食堂',
      latitude: 31.2312,
      longitude: 121.4758,
      status: 'offline',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ latitude: 31.2312, longitude: 121.4758, is_active: false });
    expect(body).not.toHaveProperty('gcj02_latitude');
    expect(body).not.toHaveProperty('gcj02_longitude');
  });
});
