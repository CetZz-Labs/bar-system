import { Request, Response } from 'express';
import User from '../models/User';
import BarUser, { BarUserRole } from '../models/BarUser';
import Bar, { BarStatus } from '../models/Bar';
import CashierShift, { CashierShiftStatus } from '../models/CashierShift';
import { checkPassword } from '../utils/auth';
import { generateCashierJWT } from '../utils/jwt';
import { searchGroupsForCashier } from '../utils/cashierSearch';

const PANEL_ROLES = [BarUserRole.OWNER, BarUserRole.CASHIER] as const;

function cookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
    };
}

export class CashierController {
    /**
     * Login panel cajero (contrato mínimo LB-53 para desbloquear LB-54).
     * Body: { email, password, barId }
     */
    static login = async (req: Request, res: Response) => {
        try {
            const { email, password, barId } = req.body as {
                email: string;
                password: string;
                barId: string;
            };

            const user = await User.findOne({ email });
            if (!user) {
                res.status(404).json({ message: 'El Usuario no esta registrado' });
                return;
            }
            if (!user.isActive) {
                res.status(403).json({ message: 'El Usuario no esta confirmado' });
                return;
            }

            const ok = await checkPassword(password, user.password);
            if (!ok) {
                res.status(403).json({ message: 'La contraseña es incorrecta' });
                return;
            }

            const bar = await Bar.findById(barId);
            if (!bar || bar.status !== BarStatus.ACTIVE) {
                res.status(404).json({ message: 'Bar no encontrado o inactivo' });
                return;
            }

            const membership = await BarUser.findOne({ bar: barId, user: user._id });
            if (!membership || !PANEL_ROLES.includes(membership.role as (typeof PANEL_ROLES)[number])) {
                res.status(403).json({ message: 'No tenés permiso de cajero en este bar' });
                return;
            }

            const role = membership.role as BarUserRole.OWNER | BarUserRole.CASHIER;

            // Kick-out: cerrar turnos activos previos del mismo usuario
            await CashierShift.updateMany(
                { user: user._id, status: CashierShiftStatus.ACTIVE },
                { $set: { status: CashierShiftStatus.CLOSED, endedAt: new Date() } }
            );

            const shift = await CashierShift.create({
                user: user._id,
                bar: barId,
                role,
                status: CashierShiftStatus.ACTIVE,
                startedAt: new Date(),
            });

            const token = generateCashierJWT({
                id: user._id.toString(),
                barId: barId.toString(),
                role,
                shiftId: shift._id.toString(),
            });

            res.cookie('cashier_token', token, cookieOptions()).json({
                message: 'Sesión de cajero iniciada',
                bar: { id: bar._id, name: bar.name },
                role,
                user: {
                    id: user._id,
                    name: user.name,
                    lastName: user.lastName,
                    email: user.email,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al iniciar sesión de cajero' });
        }
    };

    static logout = async (req: Request, res: Response) => {
        try {
            if (req.cashier?.shiftId) {
                await CashierShift.findByIdAndUpdate(req.cashier.shiftId, {
                    status: CashierShiftStatus.CLOSED,
                    endedAt: new Date(),
                });
            }
            res.clearCookie('cashier_token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                path: '/',
            });
            res.status(200).json({ message: 'Sesión de cajero cerrada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al cerrar sesión' });
        }
    };

    static session = async (req: Request, res: Response) => {
        try {
            const ctx = req.cashier!;
            const bar = await Bar.findById(ctx.barId).select('name closingHour');
            res.json({
                user: {
                    id: ctx.user._id,
                    name: ctx.user.name,
                    lastName: ctx.user.lastName,
                    email: ctx.user.email,
                },
                bar: bar
                    ? { id: bar._id, name: bar.name, closingHour: bar.closingHour || '06:00' }
                    : { id: ctx.barId, name: '', closingHour: ctx.closingHour },
                role: ctx.role,
                shiftId: ctx.shiftId,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener la sesión' });
        }
    };

    /**
     * GET /api/cashier/groups/search?q=
     * Sin logs de búsqueda (LB-54).
     */
    static searchGroups = async (req: Request, res: Response) => {
        try {
            const ctx = req.cashier!;
            const q = String(req.query.q ?? '');

            const outcome = await searchGroupsForCashier(ctx.barId, ctx.closingHour, q);

            if ('code' in outcome) {
                res.status(404).json(outcome);
                return;
            }

            res.json(outcome);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al buscar grupos' });
        }
    };
}
