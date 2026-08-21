import { Request, Response } from "express";
import Bar from "../models/Bar";
import { ShiftEndReason } from "../models/Shift";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { searchGroupsForCashier } from "../utils/cashierSearch";
import { generateShiftSummary } from "../utils/shiftSummary";

// LB-66: cookie única compartida con el login normal de usuario (ver
// ContextController). El viejo login separado de cajero (POST
// /cashier/login, `cashier_access_token`) fue eliminado — el flujo
// unificado (incluyendo la apertura de Shift + kick-out) vive ahora en
// ContextController.select.
const ACCESS_TOKEN_COOKIE = 'access_token';

export class CashierController {
    static session = async (req: Request, res: Response) => {
        try {
            const { bar: barId, barUser, shift, user } = req.cashierContext!;

            const bar = await Bar.findById(barId);
            if (!bar) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            res.status(200).json({
                bar: {
                    id: bar._id,
                    name: bar.name,
                    closingTime: bar.closingTime,
                },
                role: barUser.role,
                shift: {
                    startedAt: shift.startedAt,
                },
                user: {
                    name: user.name,
                    lastName: user.lastName,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener la sesión' });
        }
    };

    /**
     * Cierre idempotente de turno (LB-73): si el turno ya estaba cerrado
     * (retry del cliente), no lo re-cierra ni re-audita; igual devuelve el
     * resumen. `clearCookie` distingue el logout completo (cierra sesión
     * con la cookie única `access_token`) del cierre simple de turno
     * (closeShift), que mantiene la sesión activa.
     */
    private static completeShift = async (req: Request, res: Response, clearCookie: boolean) => {
        try {
            const { bar: barId, user, shift } = req.cashierContext!;

            const alreadyClosed = Boolean(shift.endedAt);

            if (!alreadyClosed) {
                shift.endedAt = new Date();
                shift.endReason = ShiftEndReason.MANUAL;
                await shift.save();
            }

            const summary = await generateShiftSummary(shift._id.toString());

            if (!alreadyClosed) {
                await AuditLog.create({
                    bar: barId,
                    user: user._id,
                    action: AuditAction.CASHIER_LOGOUT,
                    deviceInfo: shift.deviceInfo,
                    ip: req.ip,
                });
            }

            if (clearCookie) {
                // Nota de alcance (documentada en el reporte del implementer):
                // como el cookie ahora es único y compartido con la sesión de
                // usuario normal, cerrar el turno también cierra la sesión
                // completa (hay que loguearse de nuevo, incluso en modo
                // "usuario"). Se mantiene el comportamiento de "clearCookie"
                // preexistente (mínimo blast radius) en vez de re-emitir el
                // cookie en modo `user`, que sería un cambio de UX no pedido
                // explícitamente por el ticket.
                res.clearCookie(ACCESS_TOKEN_COOKIE, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                    path: '/',
                });
            }

            res.status(200).json({
                message: 'Turno cerrado correctamente',
                shiftId: shift._id,
                summary,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al cerrar el turno' });
        }
    };

    static closeShift = async (req: Request, res: Response) =>
        CashierController.completeShift(req, res, false);

    static logout = async (req: Request, res: Response) =>
        CashierController.completeShift(req, res, true);

    /**
     * GET /api/cashier/groups/search?q=
     * LB-54 — sin logs de búsqueda (privacidad).
     */
    static searchGroups = async (req: Request, res: Response) => {
        try {
            const { bar: barId } = req.cashierContext!;
            const q = String(req.query.q ?? '');

            const bar = await Bar.findById(barId).select('closingTime');
            if (!bar) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            const outcome = await searchGroupsForCashier(
                barId.toString(),
                bar.closingTime || '06:00',
                q
            );

            if ('code' in outcome) {
                res.status(404).json(outcome);
                return;
            }

            res.status(200).json(outcome);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al buscar grupos' });
        }
    };
}
