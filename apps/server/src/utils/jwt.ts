import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'

type JWTPayload = {
    id: Types.ObjectId
    barId?: Types.ObjectId
    role?: string
    shiftId?: Types.ObjectId
}

type JWTExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>

export const generateJWT = (payload: JWTPayload, expiresIn: JWTExpiresIn = '15d') => {
    const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn
    })

    return token
}
