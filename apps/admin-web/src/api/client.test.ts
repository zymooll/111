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
  });

  it('surfaces FastAPI problem details instead of hiding 4xx errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      title: '请求参数校验失败',
      detail: '账号或密码错误',
      status: 401,
    }, 401)));

    await expect(adminApi.login('admin', 'wrong')).rejects.toThrow('账号或密码错误');
  });
});
