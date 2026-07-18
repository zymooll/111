import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoodieApi } from '../types'
import { createFallbackFoodieApi, HttpApiError, httpApi } from './httpApi'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const merchant = {
  id: 'merchant-1',
  area_id: null,
  category_id: null,
  name: '测试窗口',
  description: '',
  address: '校园内',
  gcj02_latitude: 28.1,
  gcj02_longitude: 113.0,
  price_level: 2,
  business_hours: '07:00-21:00',
  is_favorite: false,
  rating_avg: 4.8
}

describe('HTTP Foodie API', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('shares one guest session across concurrent feed requests', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/guest')) return json({ access_token: 'guest-token' }, 201)
      if (url.includes('/recommendations/feed')) return json({ items: [], next_cursor: null, has_more: false })
      if (url.includes('/merchants')) return json([])
      return json({ detail: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(httpApi.getRecommendations({}, [])).resolves.toEqual({ items: [], nextCursor: undefined })
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/guest'))).toHaveLength(1)
  })

  it('rotates an expired access token and resolves backend media URLs', async () => {
    localStorage.setItem('campus-foodie:access-token', 'expired-access')
    localStorage.setItem('campus-foodie:refresh-token', 'refresh-token')
    let detailCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh')) {
        return json({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          user: { id: 'user-1', username: 'demo', email: 'demo@example.com', role: 'user', email_verified: true }
        })
      }
      if (url.endsWith('/menu-items/dish-1')) {
        detailCalls += 1
        if (detailCalls === 1) return json({ detail: '访问令牌已过期' }, 401)
        return json({
          id: 'dish-1',
          merchant_id: merchant.id,
          category_id: null,
          name: '测试菜品',
          description: '测试描述',
          item_type: 'dish',
          price_cents: 1200,
          image_url: '/media/user-1/review.jpg',
          rating_avg: 4.6,
          review_count: 3,
          tags: ['清淡'],
          merchant
        })
      }
      return json({ detail: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    const dish = await httpApi.getDish('dish-1', [])

    expect(dish?.image).toBe('http://localhost:8000/media/user-1/review.jpg')
    expect(localStorage.getItem('campus-foodie:access-token')).toBe('fresh-access')
    expect(localStorage.getItem('campus-foodie:refresh-token')).toBe('fresh-refresh')
    expect(detailCalls).toBe(2)
  })

  it('does not hide backend validation or authentication errors with mock success', async () => {
    const secondaryLogin = vi.fn().mockResolvedValue({ id: 'mock-user' })
    const primary = { login: vi.fn().mockRejectedValue(new HttpApiError('账号或密码错误', 401)) } as unknown as FoodieApi
    const secondary = { login: secondaryLogin } as unknown as FoodieApi
    const fallback = createFallbackFoodieApi(primary, secondary)

    await expect(fallback.login('demo', 'wrong-pass')).rejects.toThrow('账号或密码错误')
    expect(secondaryLogin).not.toHaveBeenCalled()
  })
})
