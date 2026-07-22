import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import './index.css'
import './kanban-fixes.css'
import './astryx-controls.css'
import './ui-polish.css'
import './sidebar-polish.css'
import './final-fixes.css'
import './collaboration.css'
import './sidebar-alignment.css'
import './interaction-polish.css'
import './palette.css'
import './product-v2.css'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
