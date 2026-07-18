import { describe, expect, it } from 'vitest'
import { api } from './api'

describe('mock Foodie API', () => {
  it('filters recommendations by hierarchical category', async () => {
    const result = await api.getRecommendations({ categoryId: 'healthy' }, [])
    expect(result.items).toHaveLength(1)
    expect(result.items[0].categoryId).toBe('salad')
  })

  it('marks favorite merchants at the API adapter boundary', async () => {
    const result = await api.getRecommendations({}, ['m1'])
    expect(result.items.find((item) => item.merchantId === 'm1')?.favorite).toBe(true)
    expect(result.items.find((item) => item.merchantId !== 'm1')?.favorite).toBe(false)
  })

  it('enforces the mock login password rule', async () => {
    await expect(api.login('demo', '123')).rejects.toThrow('账号或密码不正确')
    await expect(api.login('demo', 'Demo123!')).resolves.toMatchObject({ username: 'demo' })
  })
})
