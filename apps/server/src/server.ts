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
import leaderConsumptionRouter from './routes/leaderConsumptionRoute'
import outingCheckInRouter from './routes/outingCheckInRoute'
import outingCloseRouter from './routes/outingCloseRoute'
import cashierRouter from './routes/cashierRoute'
import contextRouter from './routes/contextRoute'
import rewardRouter from './routes/rewardRoute'
import rewardAvailableRouter from './routes/rewardAvailableRoute'
import groupRewardsRouter from './routes/groupRewardsRoute'
import groupRedemptionsRouter from './routes/groupRedemptionsRoute'
import cashierRedemptionRouter from './routes/cashierRedemptionRoute'

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
app.use('/api/groups/:groupId/rewards', groupRewardsRouter)
app.use('/api/groups/:groupId/redemptions', groupRedemptionsRouter)
app.use('/api/redemptions', cashierRedemptionRouter)
app.use('/api/groups', groupRouter)
app.use('/api/bar', barRouter)
app.use('/api/outings/:outingId/consumptions', consumptionRouter)
app.use('/api/consumptions', leaderConsumptionRouter)
app.use('/api/outings/:outingId/check-in', outingCheckInRouter)
app.use('/api/outings/:outingId/close', outingCloseRouter)
app.use('/api/cashier', cashierRouter)
app.use('/api/context', contextRouter)
app.use('/api/bars/:barId/rewards', rewardRouter)
app.use('/api/rewards', rewardAvailableRouter)
app.get('/api', (req, res) => {
    res.send('Hello World!')
})

export default app
