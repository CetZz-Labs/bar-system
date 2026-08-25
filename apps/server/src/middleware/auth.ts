import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import { Types } from "mongoose";
import User, { IUser } from "../models/User";
import BarUser, { BarUserRole, IBarUser } from "../models/BarUser";
import Bar from "../models/Bar";
import Shift, { IShift, ShiftEndReason } from "../models/Shift";
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
    shiftId?: string;
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
            cashierSummaryContext?: {
                user: IUser;
                bar: Types.ObjectId;
                barUser: IBarUser;
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
            const user = await User.findById(decoded.id).select('_id name lastName email isActive');

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
 * Middleware de autenticación genérico: valida el JWT, busca al usuario en
 * Mongo (fresco en cada request) y exige que la cuenta esté activa. No
 * distingue roles de `User` (LB-84: `User.role`/`Role` se eliminó del
 * modelo — nunca fue una fuente real de autorización, ver
 * `progress/explorers/exp_LB-84.md` §1/§6; la autorización por recurso vive
 * en `BarUser.role`/`Group.memberships[].role`).
 */
export const authenticate = () => {
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
                const user = await User.findById(decoded.id).select('_id name lastName email isActive');

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

                // 5. Asignamos el usuario al request y continuamos
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
 * Verifica la cookie única `access_token` (LB-66 — unificada con la de
 * usuario normal, ver `ContextController.select`), el vínculo del usuario
 * con el bar (BarUser), el estado del cajero y la vigencia del turno
 * (Shift), cerrándolo automáticamente si ya pasó el horario de cierre del
 * bar.
 *
 * LB-73: la lógica quedó refactorizada en `authenticateCashierRequest` con
 * `allowManualCloseRetry` (permite reintentar el cierre de un turno
 * cerrado manualmente usando el shiftId del token), expone los wrappers
 * `authenticateCashier`/`authenticateCashierForClose` y los middlewares de
 * resumen `authenticateCashierSummary`/`authenticateShiftSummary`.
 */
interface CashierAuthenticationOptions {
    allowManualCloseRetry: boolean;
}

const authenticateCashierRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
    options: CashierAuthenticationOptions,
) => {
    const token = req.cookies.access_token;

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

        // 6. A close retries, bind the request to the exact shift in the token.
        // Older tokens without shiftId may still close their active shift, but
        // they cannot retry a closed shift because they do not identify one.
        const shift = decoded.shiftId
            ? (Types.ObjectId.isValid(decoded.shiftId) ? await Shift.findById(decoded.shiftId) : null)
            : await Shift.findOne({ bar: decoded.barId, user: decoded.id, endedAt: null });
        if (!shift) {
            res.status(401).json({ message: 'No hay un turno activo, iniciá sesión nuevamente' });
            return;
        }

        if (shift.bar.toString() !== decoded.barId || shift.user.toString() !== decoded.id) {
            res.status(403).json({ message: 'No tenés acceso a este turno' });
            return;
        }

        if (shift.endedAt) {
            if (options.allowManualCloseRetry && decoded.shiftId && shift.endReason === ShiftEndReason.MANUAL) {
                req.cashierContext = {
                    user,
                    bar: new Types.ObjectId(decoded.barId),
                    barUser,
                    shift,
                };
                next();
                return;
            }

            res.status(401).json({ message: 'No hay un turno activo, iniciá sesión nuevamente' });
            return;
        }

        // 7. Verificamos si el turno debió cerrarse automáticamente al horario de cierre del bar
        const bar = await Bar.findById(decoded.barId);
        if (bar) {
            const boundary = getLastClosingBoundary(bar.closingTime);
            if (shift.startedAt < boundary) {
                // LB-66: lógica de cierre extraída a `closeBar` (cierra este y
                // cualquier otro turno vencido del bar + las salidas
                // PENDING/ACTIVE, LB-62). Import dinámico para no acoplar
                // auth ↔ Group/Outing en tests de middleware que mockean
                // User de forma parcial (mismo motivo que antes de LB-66).
                const { closeBar } = await import('../utils/closeBar.js');
                await closeBar(decoded.barId, {
                    actorUserId: decoded.id,
                    deviceInfo: shift.deviceInfo,
                    boundary,
                });

                // LB-73: envelope de auto-cierre para que el cliente pueda
                // ofrecer la recuperación del resumen (ver useCashierAuth).
                const { generateShiftSummary } = await import('../utils/shiftSummary.js');
                const summary = await generateShiftSummary(shift._id.toString());

                res.status(401).json({
                    message: 'El turno se cerró automáticamente al horario de cierre del bar',
                    code: 'SHIFT_AUTO_CLOSED',
                    shiftId: shift._id.toString(),
                    summary,
                });
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

export const authenticateCashier = async (req: Request, res: Response, next: NextFunction) =>
    authenticateCashierRequest(req, res, next, { allowManualCloseRetry: false });

export const authenticateCashierForClose = async (req: Request, res: Response, next: NextFunction) =>
    authenticateCashierRequest(req, res, next, { allowManualCloseRetry: true });

/**
 * Authenticates a cashier token for closed-shift summary access.
 * Unlike authenticateCashier, it deliberately does not require an active shift.
 */
export const authenticateCashierSummary = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.access_token;

    if (!token) {
        res.status(401).json({ message: 'No Autorizado' });
        return;
    }

    let decoded: ICashierDecodedToken;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET as string) as ICashierDecodedToken;
    } catch {
        res.status(401).json({ message: 'Token no válido o expirado' });
        return;
    }

    if (!decoded || !decoded.id || !decoded.barId) {
        res.status(401).json({ message: 'Token no válido o expirado' });
        return;
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
        res.status(401).json({ message: 'Token no válido o expirado' });
        return;
    }

    const barUser = await BarUser.findOne({ bar: decoded.barId, user: decoded.id });
    if (!barUser) {
        res.status(403).json({ message: 'No tenés acceso a este bar' });
        return;
    }

    if (!barUser.isActive || ![BarUserRole.CASHIER, BarUserRole.OWNER].includes(barUser.role)) {
        res.status(403).json({ message: 'No tenés permisos para consultar resúmenes de turnos' });
        return;
    }

    req.cashierSummaryContext = {
        user,
        bar: new Types.ObjectId(decoded.barId),
        barUser,
    };
    next();
};

/**
 * Accepts either the cashier session for that cashier's own shifts or the
 * generic authenticated session for OWNER access. The controller performs the
 * resource-level ownership check for every summary and export operation.
 */
export const authenticateShiftSummary = async (req: Request, res: Response, next: NextFunction) => {
    if (req.cookies.access_token) {
        await authenticateCashierSummary(req, res, next);
        return;
    }

    await authenticate()(req, res, next);
};
