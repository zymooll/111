import React from 'react'
import ReactDOM from 'react-dom/client'
import 'antd-mobile/es/global'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AppStateProvider } from './store/AppState'
import App from './App'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
