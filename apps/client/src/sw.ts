/// <reference lib="webworker" />
export {}

// LB-80: Service Worker propio (estrategia `injectManifest` de
// vite-plugin-pwa). Sólo maneja Web Push: recibe el payload JSON que manda
// `apps/server/src/utils/pushService.ts` y muestra la notificación; al
// clickearla abre / enfoca la app en la URL asociada.

const sw = self as unknown as ServiceWorkerGlobalScope

interface PushPayload {
    category?: 'salidas' | 'consumos' | 'canjes'
    title?: string
    body?: string
    url?: string
    relatedOuting?: string
}

sw.addEventListener('install', () => {
    sw.skipWaiting()
})

sw.addEventListener('activate', (event) => {
    event.waitUntil(sw.clients.claim())
})

sw.addEventListener('push', (event) => {
    let payload: PushPayload = {}
    try {
        payload = event.data ? (event.data.json() as PushPayload) : {}
    } catch {
        payload = { body: event.data ? event.data.text() : undefined }
    }

    const title = payload.title || 'La Banda'
    const options: NotificationOptions = {
        body: payload.body || '',
        icon: '/vite.svg',
        badge: '/vite.svg',
        data: {
            url: payload.url || (payload.relatedOuting ? `/` : '/'),
            category: payload.category,
            relatedOuting: payload.relatedOuting,
        },
    }

    event.waitUntil(sw.registration.showNotification(title, options))
})

sw.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const data = (event.notification.data ?? {}) as { url?: string }
    const targetUrl = data.url || '/'

    event.waitUntil(
        sw.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.navigate(targetUrl).catch(() => undefined)
                        return client.focus()
                    }
                }
                return sw.clients.openWindow(targetUrl)
            }),
    )
})
