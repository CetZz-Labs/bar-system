import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Router from './router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

// LB-80: registro explícito del Service Worker de Web Push, fuera del árbol
// de React. La suscripción al backend se hace después, tras el login, desde
// `usePushNotifications` (gesto del usuario).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { type: 'module', scope: '/' })
      .catch(() => {
        // Best-effort: si el registro falla, el push simplemente no queda
        // disponible; no rompe la app.
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  </StrictMode>,
)
