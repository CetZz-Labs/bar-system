import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { BarUserRole } from '../models/BarUser'

type UserPayLoad = {
    id: Types.ObjectId
}

export type CashierJwtPayload = {
    id: string
    barId: string
    role: BarUserRole.OWNER | BarUserRole.CASHIER
    shiftId: string
}

export const generateJWT = (payload: UserPayLoad) => {
    const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: '15d'
    })

    return token
}

/** JWT de panel cajero (LB-53/LB-54): incluye barId + rol + shift */
export const generateCashierJWT = (payload: CashierJwtPayload) => {
    return jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: '1d',
    })
}