import { Request, Response } from "express";
import User from "../models/User";
import BarUser from "../models/BarUser";
import Bar from "../models/Bar";
import Shift, { ShiftEndReason } from "../models/Shift";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { checkPassword } from "../utils/auth";
import { generateJWT } from "../utils/jwt";
import { searchGroupsForCashier } from "../utils/cashierSearch";
import { generateShiftSummary } from "../utils/shiftSummary";

const CASHIER_COOKIE_NAME = 'cashier_access_token';
const CASHIER_TOKEN_MAX_AGE = 15 * 24 * 60 * 60 * 1000; // 15 días en ms

export class CashierController {
    static login = async (req: Request, res: Response) => {
        try {
            const { email, password, barId, deviceInfo } = req.body;

            const user = await User.findOne({ email });
            if (!user) {
                res.status(404).json({ message: 'El Usuario no esta registrado' });
                return;
            }

            if (!user.isActive) {
                res.status(403).json({ message: 'El Usuario no esta confirmado' });
                return;
            }

            const isPasswordCorrect = await checkPassword(password, user.password);
            if (!isPasswordCorrect) {
                res.status(403).json({ message: 'La contraseña es incorrecta' });
                return;
            }

            const barUser = await BarUser.findOne({ bar: barId, user: user._id });
            if (!barUser) {
                res.status(403).json({ message: 'No tenés acceso al panel de este bar' });
                return;
            }

            if (!barUser.isActive) {
                res.status(401).json({ message: 'Tu cuenta de cajero fue desactivada' });
                return;
            }

            // Kick-out: si ya tiene un turno activo (en otro dispositivo), lo cerramos
            const previousShift = await Shift.findOne({ bar: barId, user: user._id, endedAt: null });
            if (previousShift) {
                previousShift.endedAt = new Date();
                previousShift.endReason = ShiftEndReason.KICKED_OUT;
                await previousShift.save();

                if (previousShift._id) {
                    await generateShiftSummary(previousShift._id.toString());
                }

                await AuditLog.create({
                    bar: barId,
                    user: user._id,
                    action: AuditAction.CASHIER_KICKED_OUT,
                    deviceInfo: previousShift.deviceInfo,
                    ip: req.ip,
                });
            }

            const shift = await Shift.create({
                bar: barId,
                user: user._id,
                role: barUser.role,
                deviceInfo,
                ip: req.ip,
                startedAt: new Date(),
            });

            await AuditLog.create({
                bar: barId,
                user: user._id,
                action: AuditAction.CASHIER_LOGIN,
                deviceInfo,
                ip: req.ip,
            });

            const token = generateJWT({ id: user._id, barId, role: barUser.role, shiftId: shift._id });

            res.cookie(CASHIER_COOKIE_NAME, token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: CASHIER_TOKEN_MAX_AGE,
            });

            res.status(200).json({
                message: 'Turno iniciado correctamente',
                role: barUser.role,
                bar: barId,
                shift: {
                    startedAt: shift.startedAt,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al iniciar el turno' });
        }
    };

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
                res.clearCookie(CASHIER_COOKIE_NAME, {
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
