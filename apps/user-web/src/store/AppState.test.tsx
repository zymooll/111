import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../services/api'
import { AppStateProvider, useAppState } from './AppState'

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['my-stats', 'user-1'], { publishedReviews: 99 })
  const Provider = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={queryClient}><AppStateProvider>{children}</AppStateProvider></QueryClientProvider>
    </StrictMode>
  )
  return { Provider, queryClient }
}

describe('AppState', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

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

  it('sends a single favorite request per click', async () => {
    const setFavorite = vi.spyOn(api, 'setFavorite').mockResolvedValue()
    const recordInteractions = vi.spyOn(api, 'recordInteractions').mockResolvedValue()

    const { Provider } = wrapper()
    const { result } = renderHook(() => useAppState(), { wrapper: Provider })
    await act(async () => { result.current.toggleFavorite('merchant-9') })

    expect(result.current.favorites).toContain('merchant-9')
    expect(setFavorite).toHaveBeenCalledTimes(1)
    expect(setFavorite).toHaveBeenCalledWith('merchant-9', true)
    expect(recordInteractions).toHaveBeenCalledTimes(1)
  })

  it('serializes rapid favorite clicks and keeps the last intent', async () => {
    let releaseFirst = () => {}
    const setFavorite = vi.spyOn(api, 'setFavorite')
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve }))
      .mockResolvedValue()
    vi.spyOn(api, 'recordInteractions').mockResolvedValue()

    const { Provider } = wrapper()
    const { result } = renderHook(() => useAppState(), { wrapper: Provider })
    act(() => { result.current.toggleFavorite('merchant-9') })
    act(() => { result.current.toggleFavorite('merchant-9') })

    expect(setFavorite).toHaveBeenCalledTimes(1)
    expect(result.current.favorites).not.toContain('merchant-9')
    await act(async () => { releaseFirst() })

    await waitFor(() => expect(setFavorite).toHaveBeenCalledTimes(2))
    expect(setFavorite).toHaveBeenLastCalledWith('merchant-9', false)
    expect(result.current.favorites).not.toContain('merchant-9')
  })

  it('collapses clicks that end on the value already sent', async () => {
    let releaseFirst = () => {}
    const setFavorite = vi.spyOn(api, 'setFavorite')
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve }))
      .mockResolvedValue()
    vi.spyOn(api, 'recordInteractions').mockResolvedValue()

    const { Provider } = wrapper()
    const { result } = renderHook(() => useAppState(), { wrapper: Provider })
    act(() => { result.current.toggleFavorite('merchant-9') })
    act(() => { result.current.toggleFavorite('merchant-9') })
    act(() => { result.current.toggleFavorite('merchant-9') })
    await act(async () => { releaseFirst() })

    expect(setFavorite).toHaveBeenCalledTimes(1)
    expect(setFavorite).toHaveBeenCalledWith('merchant-9', true)
    expect(result.current.favorites).toContain('merchant-9')
  })

  it('rolls back the favorite marker when the request fails', async () => {
    vi.spyOn(api, 'setFavorite').mockRejectedValue(new Error('服务暂时不可用'))

    const { Provider } = wrapper()
    const { result } = renderHook(() => useAppState(), { wrapper: Provider })
    await act(async () => { result.current.toggleFavorite('merchant-9') })

    await waitFor(() => expect(result.current.favorites).not.toContain('merchant-9'))
  })
})
