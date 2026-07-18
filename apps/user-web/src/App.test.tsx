import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { AppStateProvider } from './store/AppState'

describe('user app navigation shell', () => {
  beforeEach(() => localStorage.clear())

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
})
