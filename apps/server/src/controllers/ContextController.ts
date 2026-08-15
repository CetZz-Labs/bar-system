import { Request, Response } from "express";
import { Types } from "mongoose";
import BarUser, { BarUserRole, IBarUser } from "../models/BarUser";
import Shift, { ShiftEndReason } from "../models/Shift";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { generateJWT } from "../utils/jwt";
import { closeBar } from "../utils/closeBar";

const ACCESS_TOKEN_COOKIE = 'access_token';
// Consistente con AuthController.login (deuda preexistente documentada,
// ADR-03: no coincide con el expiresIn real del JWT firmado por
// generateJWT — no se toca acá, fuera de alcance de LB-66).
const USER_TOKEN_MAX_AGE = 15 * 60 * 60 * 1000;
// Consistente con el maxAge que usaba el viejo cashier_access_token
// (CashierController.login), ahora reusado para el cookie único cuando el
// contexto elegido es cashier/owner.
const CONTEXT_TOKEN_MAX_AGE = 15 * 24 * 60 * 60 * 1000;

export enum ContextMode {
    USER = 'user',
    CASHIER = 'cashier',
    OWNER = 'owner',
}

type SelectRequestBody = {
    mode: ContextMode;
    barId?: string;
    deviceInfo?: string;
};

function cookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
        maxAge,
    };
}

function resolveDeviceInfo(req: Request, provided?: string): string {
    if (typeof provided === 'string' && provided.trim().length > 0) {
        return provided.trim();
    }
    const userAgent = req.headers['user-agent'];
    return typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : 'unknown-device';
}

export class ContextController {
    /**
     * GET /api/context/options
     * Devuelve las opciones de contexto disponibles para el usuario logueado:
     * "usuario" (siempre disponible) + los bares donde tiene un BarUser
     * activo, agrupados por rol (CASHIER/OWNER).
     */
    static getOptions = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id;

            type PopulatedBarSummary = { _id: Types.ObjectId; name: string };

            const barUsers = await BarUser.find({ user: userId, isActive: true })
                .populate<{ bar: PopulatedBarSummary }>('bar', 'name')
                .lean();

            const cashier = barUsers
                .filter((bu) => bu.role === BarUserRole.CASHIER)
                .map((bu) => ({ barId: bu.bar._id.toString(), barName: bu.bar.name }));

            const owner = barUsers
                .filter((bu) => bu.role === BarUserRole.OWNER)
                .map((bu) => ({ barId: bu.bar._id.toString(), barName: bu.bar.name }));

            res.status(200).json({ user: true, cashier, owner });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener las opciones de contexto' });
        }
    };

    /**
     * POST /api/context/select
     * Re-emite la cookie única `access_token` según el contexto elegido:
     * - user: claims { id } — sin barId/role, sin tocar ningún Shift.
     * - cashier/owner: valida el BarUser correspondiente (CASHIER u OWNER),
     *   aplica el mismo cierre perezoso de bar (`closeBar`, LB-62/LB-66) y
     *   kick-out de turno previo (`ShiftEndReason.KICKED_OUT`) que usaba el
     *   viejo `CashierController.login`, abre un Shift nuevo y audita.
     *
     * Decisión de alcance (documentada en progress/implementers/impl_LB-66.md):
     * el contexto `owner` reusa exactamente el mismo flujo que `cashier`
     * (solo cambia el rol de BarUser validado), abriendo también un Shift.
     * Es la interpretación más simple que satisface "panel del dueño con
     * acceso al panel del cajero" sin duplicar lógica de apertura de turno.
     */
    static select = async (req: Request, res: Response) => {
        try {
            const { mode, barId, deviceInfo: rawDeviceInfo } = req.body as SelectRequestBody;
            const userId = req.user!._id;

            if (mode === ContextMode.USER) {
                const token = generateJWT({ id: userId });
                res.cookie(ACCESS_TOKEN_COOKIE, token, cookieOptions(USER_TOKEN_MAX_AGE));
                res.status(200).json({ mode: ContextMode.USER });
                return;
            }

            if (!barId) {
                res.status(400).json({ message: 'barId es requerido' });
                return;
            }

            const role = mode === ContextMode.CASHIER ? BarUserRole.CASHIER : BarUserRole.OWNER;
            const roleLabel = mode === ContextMode.CASHIER ? 'cajero' : 'dueño';

            const barUser: IBarUser | null = await BarUser.findOne({ bar: barId, user: userId, role });
            if (!barUser) {
                res.status(403).json({ message: `No tenés acceso al panel de ${roleLabel} de este bar` });
                return;
            }

            if (!barUser.isActive) {
                res.status(401).json({ message: `Tu cuenta de ${roleLabel} fue desactivada` });
                return;
            }

            const deviceInfo = resolveDeviceInfo(req, rawDeviceInfo);

            // Cierre perezoso: si el bar ya debió cerrar (turnos/salidas
            // vencidas desde el último horario de cierre), lo resolvemos
            // antes de abrir un turno nuevo.
            await closeBar(barId, { actorUserId: userId, deviceInfo, ip: req.ip });

            // Kick-out: mismo patrón que el viejo CashierController.login —
            // si ya hay un turno activo del mismo user+bar (otro
            // dispositivo), lo cerramos.
            const previousShift = await Shift.findOne({ bar: barId, user: userId, endedAt: null });
            if (previousShift) {
                previousShift.endedAt = new Date();
                previousShift.endReason = ShiftEndReason.KICKED_OUT;
                await previousShift.save();

                await AuditLog.create({
                    bar: barId,
                    user: userId,
                    action: AuditAction.CASHIER_KICKED_OUT,
                    deviceInfo: previousShift.deviceInfo,
                    ip: req.ip,
                });
            }

            const shift = await Shift.create({
                bar: barId,
                user: userId,
                role: barUser.role,
                deviceInfo,
                ip: req.ip,
                startedAt: new Date(),
            });

            await AuditLog.create({
                bar: barId,
                user: userId,
                action: AuditAction.CASHIER_LOGIN,
                deviceInfo,
                ip: req.ip,
            });

            const token = generateJWT({ id: userId, barId: new Types.ObjectId(barId), role: barUser.role });

            res.cookie(ACCESS_TOKEN_COOKIE, token, cookieOptions(CONTEXT_TOKEN_MAX_AGE));

            res.status(200).json({
                mode,
                role: barUser.role,
                bar: barId,
                shift: { startedAt: shift.startedAt },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al seleccionar el contexto' });
        }
    };
}
