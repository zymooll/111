import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './services/api'
import { AppStateProvider } from './store/AppState'

describe('user app navigation shell', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the personalized home feed for guests', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('把每一餐，都选得刚刚好')).toBeInTheDocument()
    expect(await screen.findByText('招牌藤椒鸡双拼饭')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument()
  })

  it('keeps the home navigation limited to home, map and mine', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    const navigation = screen.getByRole('navigation', { name: '主要导航' })
    expect(navigation).toHaveTextContent('首页')
    expect(navigation).toHaveTextContent('地图')
    expect(navigation).toHaveTextContent('我的')
    expect(navigation).not.toHaveTextContent('我也吃过')
    expect(navigation.querySelectorAll('a')).toHaveLength(3)
  })

  it('uses nextCursor to continue loading the home feed', async () => {
    const user = userEvent.setup()
    const source = await api.getRecommendations({}, [])
    const getRecommendations = vi.spyOn(api, 'getRecommendations')
      .mockResolvedValueOnce({ items: [source.items[0]], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [source.items[1]] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText(source.items[0].name)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续发现更多菜品' }))
    expect(await screen.findByText(source.items[1].name)).toBeInTheDocument()
    expect(getRecommendations).toHaveBeenNthCalledWith(2, expect.any(Object), expect.any(Array), 'cursor-2')
  })

  it('renders the editable de-identified preference profile', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/preferences']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('你的校园饮食画像')).toBeInTheDocument()
    expect(await screen.findByText('喜欢的口味与场景')).toBeInTheDocument()
    expect(screen.getByText('希望避开的特征')).toBeInTheDocument()
    expect(screen.getByText('DeepSeek 仅接收去标识化的偏好标签、行为汇总和数据库候选，不接收账号、邮箱、原始搜索文本或评价原文。')).toBeInTheDocument()
  })

  it('records review reading when a dish detail is viewed', async () => {
    const viewReview = vi.spyOn(api, 'viewReview').mockResolvedValue()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/dish/d1']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('藤椒香很足但不会呛，酥肉还是脆的。窗口阿姨打菜也很大方，赶课的时候八分钟拿到。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '我也吃过' })).toBeInTheDocument()
    await waitFor(() => expect(viewReview).toHaveBeenCalled())
  })

  it('lets a guest write a review draft and redirects only when publishing', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/dish/d1/review']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('游客也可以先写草稿')).toBeInTheDocument()
    await user.click(screen.getAllByRole('radio')[4])
    await user.type(screen.getByPlaceholderText('真实、具体的体验最能帮助到同学……'), '味道很好，分量也很足。')
    await user.click(screen.getByRole('button', { name: '登录并发布' }))

    expect(await screen.findByText('欢迎回到校园食刻')).toBeInTheDocument()
    expect(sessionStorage.getItem('campus-foodie:review-draft:d1')).toContain('味道很好')
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByDisplayValue('味道很好，分量也很足。')).toBeInTheDocument()
    expect(screen.queryByText('游客也可以先写草稿')).not.toBeInTheDocument()
  })

  it('refreshes the dish rating after a published review is submitted', async () => {
    localStorage.setItem('campus-foodie:user', JSON.stringify({
      id: 'u1', username: 'demo', email: 'demo@example.com', displayName: '演示用户',
      publishedReviews: 0, views: 0, emailVerified: true
    }))
    const initialDish = await api.getDish('d1', [])
    expect(initialDish).toBeDefined()
    const refreshedDish = {
      ...initialDish!,
      rating: 4.75,
      reviewCount: initialDish!.reviewCount + 1
    }
    const getDish = vi.spyOn(api, 'getDish')
      .mockResolvedValueOnce(initialDish)
      .mockResolvedValue(refreshedDish)
    vi.spyOn(api, 'submitReview').mockResolvedValue({
      id: 'review-new',
      dishId: 'd1',
      userId: 'u1',
      userName: 'demo',
      avatarText: 'd',
      rating: 5,
      content: '味道很好，分量也很足。',
      images: [],
      createdAt: '2026/07/18',
      likes: 0,
      status: 'published'
    })
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/dish/d1/review']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText(initialDish!.name)).toBeInTheDocument()
    await user.click(screen.getAllByRole('radio')[4])
    await user.type(screen.getByPlaceholderText('真实、具体的体验最能帮助到同学……'), '味道很好，分量也很足。')
    await user.click(screen.getByRole('button', { name: '发布评价' }))

    expect(await screen.findByText(`${refreshedDish.reviewCount} 人评价`)).toBeInTheDocument()
    expect(screen.getByText('4.75')).toBeInTheDocument()
    expect(getDish.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('reads current profile statistics instead of the login snapshot', async () => {
    localStorage.setItem('campus-foodie:user', JSON.stringify({
      id: 'u1', username: 'demo', email: 'demo@example.com', displayName: '演示用户',
      publishedReviews: 0, views: 0, emailVerified: true
    }))
    const getMyStats = vi.spyOn(api, 'getMyStats').mockResolvedValue({ publishedReviews: 7, totalViews: 126, favoriteMerchants: 0 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/mine']}>
          <AppStateProvider><App /></AppStateProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('126')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(getMyStats).toHaveBeenCalledTimes(1)
  })
})
