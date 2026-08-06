import { Request, Response } from "express";
import User from "../models/User";
import BarUser from "../models/BarUser";
import Bar from "../models/Bar";
import Shift, { ShiftEndReason } from "../models/Shift";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { checkPassword } from "../utils/auth";
import { generateJWT } from "../utils/jwt";

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

            const token = generateJWT({ id: user._id, barId, role: barUser.role });

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
            const { bar: barId, barUser, shift } = req.cashierContext!;

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
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener la sesión' });
        }
    };

    static logout = async (req: Request, res: Response) => {
        try {
            const { bar: barId, user, shift } = req.cashierContext!;

            shift.endedAt = new Date();
            shift.endReason = ShiftEndReason.MANUAL;
            await shift.save();

            await AuditLog.create({
                bar: barId,
                user: user._id,
                action: AuditAction.CASHIER_LOGOUT,
                deviceInfo: shift.deviceInfo,
                ip: req.ip,
            });

            res.clearCookie(CASHIER_COOKIE_NAME, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                path: '/',
            });

            res.status(200).json({ message: 'Turno cerrado correctamente' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al cerrar el turno' });
        }
    };
}
