import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppStateProvider, useAppState } from './AppState'

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['my-stats', 'user-1'], { publishedReviews: 99 })
  const Provider = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}><AppStateProvider>{children}</AppStateProvider></QueryClientProvider>
  )
  return { Provider, queryClient }
}

describe('AppState', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('removes account-derived favorites and private drafts on logout', async () => {
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

    const { Provider, queryClient } = wrapper()
    const { result } = renderHook(() => useAppState(), { wrapper: Provider })
    await act(async () => { await result.current.logout() })

    expect(result.current.user).toBeNull()
    expect(result.current.favorites).toEqual([])
    expect(sessionStorage.getItem('campus-foodie:review-draft:dish-1')).toBeNull()
    expect(sessionStorage.getItem('unrelated-key')).toBe('keep')
    expect(queryClient.getQueryData(['my-stats', 'user-1'])).toBeUndefined()
    await waitFor(() => expect(localStorage.getItem('campus-foodie:user')).toBeNull())
    expect(localStorage.getItem('campus-foodie:favorites')).toBe('[]')
  })

  it('keeps anonymous device favorites available to a guest', () => {
    localStorage.setItem('campus-foodie:favorites', JSON.stringify(['merchant-2']))

    const { Provider } = wrapper()
    const { result } = renderHook(() => useAppState(), { wrapper: Provider })

    expect(result.current.user).toBeNull()
    expect(result.current.favorites).toEqual(['merchant-2'])
  })
})
