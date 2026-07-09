import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClerkProvider } from '@clerk/react'
import App from './App'
import { ToastProvider } from './components/toast/ToastContext'
import { ApiError } from './lib/apiError'
import './index.css'
// React Flow base styles — imported here, not in index.css, so the Tailwind v4
// @import chain there stays contiguous.
import '@xyflow/react/dist/style.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 4xx — the request will fail the same way again.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return failureCount < 2
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>,
)
