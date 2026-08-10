import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import { Types } from "mongoose";
import User, { IUser, Role } from "../models/User";
import BarUser, { IBarUser } from "../models/BarUser";
import Bar from "../models/Bar";
import Shift, { IShift, ShiftEndReason } from "../models/Shift";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { getLastClosingBoundary } from "../utils/shift";

interface IDecodedToken {
    id: string;
    iat?: number;
    exp?: number;
}

interface ICashierDecodedToken {
    id: string;
    barId: string;
    role?: string;
    iat?: number;
    exp?: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
            cashierContext?: {
                user: IUser;
                bar: Types.ObjectId;
                barUser: IBarUser;
                shift: IShift;
            };
        }
    }
}

/**
 * Middleware opcional de autenticación.
 * Si hay token válido, inyecta req.user. Si no, continúa sin error.
 */
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.access_token;

    if (!token) {
        next();
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as IDecodedToken;

        if (decoded && decoded.id) {
            const user = await User.findById(decoded.id).select('_id name lastName email role isActive');

            if (user && user.isActive) {
                req.user = user;
            }
        }
    } catch {
        // Token inválido: continuar sin usuario
    }

    next();
};

/**
 * Middleware para verificar que el usuario tenga el perfil completado.
 */
export const requireCompleteProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            res.status(403).json({ message: 'Debes completar tu perfil antes de continuar' });
            return;
        }

        const user = await User.findById(req.user._id).select('profileComplete');

        if (!user || !user.profileComplete) {
            res.status(403).json({ message: 'Debes completar tu perfil antes de continuar' });
            return;
        }

        next();
    } catch (error) {
        console.error(error);
        res.status(403).json({ message: 'Debes completar tu perfil antes de continuar' });
    }
};

/**
 * Middleware para autenticar y verificar roles.
 * @param allowedRoles Array de roles permitidos. Por defecto es [Role.USER]
 */
export const authenticate = (allowedRoles: Role[] = [Role.USER]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = req.cookies.access_token;

        // 1. Verificamos si hay token
        if (!token) {
            res.status(401).json({ message: 'No Autorizado' });
            return;
        }

        try {
            // 2. Decodificamos el token
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as IDecodedToken;

            if (decoded && decoded.id) {
                // 3. Buscamos al usuario en la base de datos (Adaptado a tu Mongoose)
                const user = await User.findById(decoded.id).select('_id name lastName email role isActive');

                if (!user) {
                    res.status(401).json({ message: 'Token No Válido o usuario inexistente' });
                    return;
                }

                // 4. Verificamos si la cuenta está activa
                // (Nota: Corregí el mensaje de tu código original que decía "no ha sido desactivada")
                if (!user.isActive) {
                    res.status(401).json({ message: 'La cuenta está desactivada' });
                    return;
                }

                // 5. VALIDACIÓN DE ROLES
                // Verificamos si el rol del usuario está dentro de los permitidos
                if (!allowedRoles.includes(user.role as Role)) {
                    res.status(403).json({ message: 'Acceso Denegado: No tienes los permisos necesarios' });
                    return;
                }

                // 6. Asignamos el usuario al request y continuamos
                req.user = user;
                next();
            }

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Token No Válido o expirado' });
            return;
        }
    };
};

/**
 * Middleware de autenticación para el panel de cajero.
 * Verifica la cookie `cashier_access_token`, el vínculo del usuario con el
 * bar (BarUser), el estado del cajero y la vigencia del turno (Shift),
 * cerrándolo automáticamente si ya pasó el horario de cierre del bar.
 */
export const authenticateCashier = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.cashier_access_token;

    // 1. Verificamos si hay token
    if (!token) {
        res.status(401).json({ message: 'No Autorizado' });
        return;
    }

    let decoded: ICashierDecodedToken;
    try {
        // 2. Decodificamos el token
        decoded = jwt.verify(token, process.env.JWT_SECRET as string) as ICashierDecodedToken;
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Token no válido o expirado' });
        return;
    }

    try {
        if (!decoded || !decoded.id || !decoded.barId) {
            res.status(401).json({ message: 'Token no válido o expirado' });
            return;
        }

        // 3. Buscamos al usuario
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            res.status(401).json({ message: 'Token no válido o expirado' });
            return;
        }

        // 4. Verificamos el vínculo con el bar (cubre el caso de un cliente regular)
        const barUser = await BarUser.findOne({ bar: decoded.barId, user: decoded.id });
        if (!barUser) {
            res.status(403).json({ message: 'No tenés acceso a este bar' });
            return;
        }

        // 5. Verificamos que el cajero no haya sido desactivado por el OWNER
        if (!barUser.isActive) {
            res.status(401).json({ message: 'Tu cuenta de cajero fue desactivada' });
            return;
        }

        // 6. Buscamos el turno activo
        const shift = await Shift.findOne({ bar: decoded.barId, user: decoded.id, endedAt: null });
        if (!shift) {
            res.status(401).json({ message: 'No hay un turno activo, iniciá sesión nuevamente' });
            return;
        }

        // 7. Verificamos si el turno debió cerrarse automáticamente al horario de cierre del bar
        const bar = await Bar.findById(decoded.barId);
        if (bar) {
            const boundary = getLastClosingBoundary(bar.closingTime);
            if (shift.startedAt < boundary) {
                shift.endedAt = boundary;
                shift.endReason = ShiftEndReason.BAR_CLOSED;
                await shift.save();

                await AuditLog.create({
                    bar: decoded.barId,
                    user: decoded.id,
                    action: AuditAction.SHIFT_AUTO_CLOSED,
                    deviceInfo: shift.deviceInfo,
                });

                res.status(401).json({ message: 'El turno se cerró automáticamente al horario de cierre del bar' });
                return;
            }
        }

        // 8. Todo OK: adjuntamos el contexto de cajero y continuamos
        req.cashierContext = {
            user,
            bar: new Types.ObjectId(decoded.barId),
            barUser,
            shift,
        };
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Hubo un error al autenticar el turno' });
    }
};