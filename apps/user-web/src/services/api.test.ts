import { describe, expect, it } from 'vitest'
import { api } from './api'

describe('mock Foodie API', () => {
  it('filters recommendations by hierarchical category', async () => {
    const result = await api.getRecommendations({ categoryId: 'healthy' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].categoryId).toBe('salad')
  })

  it('keeps the favorite filter on the API side instead of the caller', async () => {
    await api.setFavorite('m2', true)
    const favorited = await api.getMerchants({ favoriteOnly: true })
    expect(favorited.map((merchant) => merchant.id)).toContain('m2')

    await api.setFavorite('m2', false)
    const remaining = await api.getMerchants({ favoriteOnly: true })
    expect(remaining.map((merchant) => merchant.id)).not.toContain('m2')
  })

  it('enforces the mock login password rule', async () => {
    await expect(api.login('demo', '123')).rejects.toThrow('账号或密码不正确')
    await expect(api.login('demo', 'Demo123!')).resolves.toMatchObject({ username: 'demo' })
  })
})
