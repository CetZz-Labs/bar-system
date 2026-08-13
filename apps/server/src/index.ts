import http from 'http'
import app from './server'
import { initPointsHub } from './websocket/pointsHub'

const port = process.env.PORT || 3000

if (process.env.NODE_ENV !== 'production') {
    const httpServer = http.createServer(app)
    initPointsHub(httpServer)

    httpServer.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`)
    })
}
