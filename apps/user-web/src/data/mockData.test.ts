import { describe, expect, it } from 'vitest'
import { dishes, merchants } from './mockData'

describe('mock catalog provenance', () => {
  it('marks generated records structurally without leaking demo labels into filters', () => {
    expect(merchants.every((merchant) => merchant.isDemo)).toBe(true)
    expect(dishes.every((dish) => dish.isDemo)).toBe(true)
    expect(merchants.find((merchant) => merchant.id === 'm3')?.categoryId).toBe('salad')
    expect(merchants.flatMap((merchant) => merchant.tags)).not.toContain('演示菜单')
    expect(dishes.flatMap((dish) => dish.tags)).not.toContain('演示菜单')
  })
})
