import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppStateProvider, useAppState } from './AppState'

describe('AppState', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('removes private review drafts on logout while keeping device favorites', () => {
    localStorage.setItem('campus-foodie:user', JSON.stringify({
      id: 'user-1',
      username: 'demo',
      email: 'demo@example.com',
      displayName: '演示用户',
      publishedReviews: 0,
      views: 0,
      emailVerified: true
    }))
    localStorage.setItem('campus-foodie:favorites', JSON.stringify(['merchant-1']))
    sessionStorage.setItem('campus-foodie:review-draft:dish-1', JSON.stringify({ content: '私密草稿' }))
    sessionStorage.setItem('unrelated-key', 'keep')

    const { result } = renderHook(() => useAppState(), { wrapper: AppStateProvider })
    act(() => result.current.logout())

    expect(result.current.user).toBeNull()
    expect(result.current.favorites).toEqual(['merchant-1'])
    expect(sessionStorage.getItem('campus-foodie:review-draft:dish-1')).toBeNull()
    expect(sessionStorage.getItem('unrelated-key')).toBe('keep')
  })
})
