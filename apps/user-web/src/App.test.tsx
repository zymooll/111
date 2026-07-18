import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
  afterEach(() => vi.restoreAllMocks())

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
    await waitFor(() => expect(viewReview).toHaveBeenCalled())
  })
})
