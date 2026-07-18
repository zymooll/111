import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from './client';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
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
      user: { id: 'admin-1', username: 'admin', role: 'super_admin' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/admin/api/v1/auth/login');
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

    const result = await adminApi.merchants({ page: 1, pageSize: 10 });

    expect(result).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: 'merchant-1', campusId: '00000000-0000-0000-0000-000000000001' })],
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/merchants?campus_id=00000000-0000-0000-0000-000000000001');
  });

  it('surfaces FastAPI problem details instead of hiding 4xx errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      title: '请求参数校验失败',
      detail: '账号或密码错误',
      status: 401,
    }, 401)));

    await expect(adminApi.login('admin', 'wrong')).rejects.toThrow('账号或密码错误');
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

  it('preserves coordinates selected by the merchant map in the API payload', async () => {
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
      status: 'draft',
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      latitude: 31.2312,
      longitude: 121.4758,
    });
  });
});
