import express, { Express } from 'express'
import morgan from 'morgan'
import authRouter from './routes/authRoute'
import userRouter from './routes/userRoute'
import { corsMiddleware } from './config/cors'
import { connectDB } from './config/db'
import cookieParser from 'cookie-parser'
import path from 'path'

import groupRouter from './routes/groupRoute'
import barRouter from './routes/barRoute'
import outingRouter from './routes/outingRoute'
import consumptionRouter from './routes/consumptionRoute'
import outingCheckInRouter from './routes/outingCheckInRoute'
import cashierRouter from './routes/cashierRoute'

if (process.env.NODE_ENV !== 'production') {
    process.loadEnvFile()
}

connectDB()

const app: Express = express()
app.use(corsMiddleware())
app.use(cookieParser());

// Logging
app.use(morgan('dev'))

app.use(express.json())

// Serve static files (avatars)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

// Routes
app.use('/api/auth', authRouter)
app.use('/api/users', userRouter)
app.use('/api/groups/:groupId/outings', outingRouter)
app.use('/api/groups', groupRouter)
app.use('/api/bar', barRouter)
app.use('/api/outings/:outingId/consumptions', consumptionRouter)
app.use('/api/outings/:outingId/check-in', outingCheckInRouter)
app.use('/api/cashier', cashierRouter)
app.get('/api', (req, res) => {
    res.send('Hello World!')
})

export default app
