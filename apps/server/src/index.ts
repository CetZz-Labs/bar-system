import http from 'http'
import app from './server'
import { initPointsHub } from './websocket/pointsHub'

const port = process.env.PORT || 3000

// Arranque HTTP + WebSocket: se ejecuta en todos los entornos (incluido
// `production` en Render) salvo bajo tests, donde nunca se debe abrir un
// puerto. Se deja como guarda defensiva `!== 'test'` en lugar de quitar el
// `if` por si algún test futuro llegara a importar este módulo (evita
// EADDRINUSE / handles colgados en vitest).
if (process.env.NODE_ENV !== 'test') {
    const httpServer = http.createServer(app)
    initPointsHub(httpServer)

    httpServer.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })
}
