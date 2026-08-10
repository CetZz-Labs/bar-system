import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import Bar from '../models/Bar';
import CashierShift, { CashierShiftStatus } from '../models/CashierShift';
import { BarUserRole } from '../models/BarUser';
import { CashierJwtPayload } from '../utils/jwt';
import { isShiftPastBarClose } from '../utils/barDay';

export interface CashierContext {
    user: IUser;
    barId: string;
    role: BarUserRole.OWNER | BarUserRole.CASHIER;
    shiftId: string;
    closingHour: string;
}

declare global {
    namespace Express {
        interface Request {
            cashier?: CashierContext;
        }
    }
}

/**
 * Requiere cookie `cashier_token` con sesión de turno activa (LB-53).
 * Si el día del bar cerró → cierra el turno y responde 401.
 */
export const requireCashierSession = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.cashier_token;

    if (!token) {
        res.status(401).json({ message: 'No Autorizado' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as CashierJwtPayload;

        if (!decoded?.id || !decoded.barId || !decoded.shiftId) {
            res.status(401).json({ message: 'Token No Válido' });
            return;
        }

        if (decoded.role !== BarUserRole.OWNER && decoded.role !== BarUserRole.CASHIER) {
            res.status(403).json({ message: 'Acceso Denegado: rol de cajero requerido' });
            return;
        }

        const [user, shift, bar] = await Promise.all([
            User.findById(decoded.id).select('_id name lastName email role isActive'),
            CashierShift.findById(decoded.shiftId),
            Bar.findById(decoded.barId).select('closingHour name status'),
        ]);

        if (!user || !user.isActive) {
            res.status(401).json({ message: 'Token No Válido o usuario inexistente' });
            return;
        }

        if (!shift || shift.status !== CashierShiftStatus.ACTIVE) {
            res.clearCookie('cashier_token', cookieClearOptions());
            res.status(401).json({ message: 'Turno cerrado. Volvé a iniciar sesión.' });
            return;
        }

        if (!bar) {
            res.status(401).json({ message: 'Bar no encontrado' });
            return;
        }

        const closingHour = bar.closingHour || '06:00';
        const now = new Date();

        if (isShiftPastBarClose(shift.startedAt, now, closingHour)) {
            shift.status = CashierShiftStatus.CLOSED;
            shift.endedAt = now;
            await shift.save();
            res.clearCookie('cashier_token', cookieClearOptions());
            res.status(401).json({ message: 'Turno cerrado automáticamente. Volvé a iniciar sesión.' });
            return;
        }

        req.cashier = {
            user,
            barId: decoded.barId,
            role: decoded.role,
            shiftId: decoded.shiftId,
            closingHour,
        };

        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Token No Válido o expirado' });
    }
};

function cookieClearOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
        path: '/',
    };
}
