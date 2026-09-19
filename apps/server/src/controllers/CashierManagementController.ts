import crypto from "crypto";
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Bar from "../models/Bar";
import BarUser, { BarUserRole, IBarUser } from "../models/BarUser";
import User, { IUser } from "../models/User";
import Token from "../models/Token";
import { AuthEmail } from "../emails/AuthEmail";
import { generateToken } from "../utils/token";
import { resolveOwnerAccess } from "../utils/barAccess";
import { writeAuditLog } from "../utils/auditLogService";

// LB-115: ABM de cajeros (BarUser{role:CASHIER}) por el OWNER del bar.
// Mismo patrón estructural que RewardController (LB-67/LB-74): rutas
// anidadas bajo /api/bars/:barId/cashiers, `resolveOwnerAccess` en cada
// endpoint, `writeAuditLog` en cada mutación. `BarUser` no tiene un enum de
// estado como `Reward.status` — ya trae `isActive: boolean` nativo, así que
// "desactivar" se resuelve con el mismo PUT que "editar" (no hay más campos
// mutables en BarUser que isActive; ver progress/implementers/impl_LB-115.md).
//
// Login/sesión/turno de cajero (LB-66, ContextController/authenticateCashier)
// NO se tocan acá — ver progress/explorers/exp_LB-115.md §3. Este controller
// solo crea/edita/lista el vínculo BarUser que esos flujos ya presuponen.

function isMongoDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error;
}

interface CashierDTO {
    id: string;
    bar: string;
    role: BarUserRole;
    isActive: boolean;
    user: {
        id: string;
        name: string;
        lastName: string;
        email: string;
        /** Estado de la cuenta `User` en sí (pendiente de activar vs. ya
         * activa) — distinto de `isActive` de más arriba, que es el estado
         * del vínculo BarUser con este bar puntual. */
        accountActive: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}

function toCashierDTO(barUser: IBarUser, user: Pick<IUser, '_id' | 'name' | 'lastName' | 'email' | 'isActive'>): CashierDTO {
    return {
        id: barUser._id.toString(),
        bar: barUser.bar.toString(),
        role: barUser.role,
        isActive: barUser.isActive,
        user: {
            id: user._id.toString(),
            name: user.name,
            lastName: user.lastName,
            email: user.email,
            accountActive: user.isActive,
        },
        createdAt: barUser.createdAt,
        updatedAt: barUser.updatedAt,
    };
}

export class CashierManagementController {
    /**
     * GET /api/bars/:barId/cashiers — solo OWNER (a diferencia de
     * RewardController.listRewards, acá el listado también es OWNER-only
     * porque expone datos personales de otro `User`).
     */
    static listCashiers = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        type PopulatedCashierUser = Pick<IUser, 'name' | 'lastName' | 'email' | 'isActive'> & {
            _id: Types.ObjectId;
        };

        const barUsers = await BarUser.find({ bar: barId, role: BarUserRole.CASHIER })
            .populate<{ user: PopulatedCashierUser }>('user', 'name lastName email isActive')
            .sort({ createdAt: -1 })
            .lean();

        const cashiers = barUsers.map((bu) => ({
            id: bu._id.toString(),
            bar: bu.bar.toString(),
            role: bu.role,
            isActive: bu.isActive,
            user: {
                id: bu.user._id.toString(),
                name: bu.user.name,
                lastName: bu.user.lastName,
                email: bu.user.email,
                accountActive: bu.user.isActive,
            },
            createdAt: bu.createdAt,
            updatedAt: bu.updatedAt,
        }));

        res.status(200).json(cashiers);
    };

    /**
     * POST /api/bars/:barId/cashiers — solo OWNER.
     *
     * Dos caminos según si ya existe un `User` con ese email (ver
     * progress/implementers/impl_LB-115.md §"Decisión: alta de cajero"):
     *  - Existe: se vincula directamente con un `BarUser{role:CASHIER}`
     *    nuevo. Nunca se toca/recrea el `User` existente.
     *  - No existe: se crea un `User{isActive:false}` con un password
     *    aleatorio (nunca expuesto) + el `BarUser` en la misma transacción
     *    Mongo, y se envía un email de invitación con un token de
     *    activación (mismo modelo `Token` que `AuthController`) para que el
     *    cajero fije su propia contraseña vía
     *    `POST /api/auth/activate-cashier-account`.
     */
    static createCashier = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const bar = await Bar.findById(barId).select('name').lean();
        if (!bar) {
            res.status(404).json({ message: 'Bar no encontrado' });
            return;
        }

        const { name, lastName, email } = req.body;

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            const existingBarUser = await BarUser.findOne({ bar: barId, user: existingUser._id });
            if (existingBarUser) {
                res.status(409).json({ message: 'Este usuario ya tiene un rol asignado en este bar' });
                return;
            }

            let barUser: IBarUser;
            try {
                barUser = await BarUser.create({
                    bar: barId,
                    user: existingUser._id,
                    role: BarUserRole.CASHIER,
                    isActive: true,
                });
            } catch (error) {
                // Red de seguridad ante condiciones de carrera: el chequeo
                // de `existingBarUser` de arriba ya cubre el caso normal,
                // pero el índice único {bar,user} es la fuente de verdad.
                if (isMongoDuplicateKeyError(error) && error.code === 11000) {
                    res.status(409).json({ message: 'Este usuario ya tiene un rol asignado en este bar' });
                    return;
                }
                throw error;
            }

            writeAuditLog({
                bar: new Types.ObjectId(barId),
                actorType: 'OWNER',
                actorId: req.user!._id,
                eventType: 'cashier.created',
                entityType: 'BarUser',
                entityId: barUser._id,
                metadata: { cashierUserId: existingUser._id, email: existingUser.email, newAccount: false },
            });

            res.status(201).json(toCashierDTO(barUser, existingUser));
            return;
        }

        const session = await mongoose.startSession();
        let newUser: IUser;
        let barUser: IBarUser;
        try {
            session.startTransaction();

            // Password aleatorio criptográficamente seguro: nunca se
            // expone ni se comunica — solo satisface el campo `required`
            // del schema hasta que el cajero fije el suyo vía
            // activateCashierAccount. Se hashea igual por el hook
            // `pre('save')` de User (userSchema.pre('save')).
            const randomPassword = crypto.randomBytes(32).toString('hex');

            const createdUsers = await User.create(
                [{ name, lastName, email, password: randomPassword, isActive: false }],
                { session },
            );
            newUser = createdUsers[0];

            const createdBarUsers = await BarUser.create(
                [{ bar: barId, user: newUser._id, role: BarUserRole.CASHIER, isActive: true }],
                { session },
            );
            barUser = createdBarUsers[0];

            await session.commitTransaction();
        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }
            throw error;
        } finally {
            session.endSession();
        }

        // Token + email fuera de la transacción (mismo patrón que
        // AuthController.createAccount: el flujo de invitación no es
        // atómico con el alta del User/BarUser, es un paso posterior).
        const token = new Token();
        token.token = generateToken();
        token.user = newUser._id;

        AuthEmail.sendCashierInviteEmail({
            email: newUser.email,
            name: newUser.name,
            token: token.token,
            barName: bar.name,
        });

        await token.save();

        writeAuditLog({
            bar: new Types.ObjectId(barId),
            actorType: 'OWNER',
            actorId: req.user!._id,
            eventType: 'cashier.created',
            entityType: 'BarUser',
            entityId: barUser._id,
            metadata: { cashierUserId: newUser._id, email: newUser.email, newAccount: true },
        });

        res.status(201).json(toCashierDTO(barUser, newUser));
    };

    /**
     * PUT /api/bars/:barId/cashiers/:cashierId — solo OWNER. `cashierId` es
     * el `_id` del `BarUser`, no del `User`. Único campo mutable: `isActive`
     * (activar/desactivar) — `BarUser` no tiene más campos propios que el
     * OWNER pueda editar sin tocar el `User` compartido (ver
     * progress/implementers/impl_LB-115.md).
     */
    static updateCashier = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const cashierId = req.params.cashierId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const barUser = await BarUser.findOne({ _id: cashierId, bar: barId, role: BarUserRole.CASHIER });
        if (!barUser) {
            res.status(404).json({ message: 'Cajero no encontrado' });
            return;
        }

        const { isActive } = req.body;
        barUser.isActive = isActive;
        await barUser.save();

        const user = await User.findById(barUser.user).select('name lastName email isActive');
        if (!user) {
            res.status(404).json({ message: 'Usuario asociado no encontrado' });
            return;
        }

        writeAuditLog({
            bar: new Types.ObjectId(barId),
            actorType: 'OWNER',
            actorId: req.user!._id,
            eventType: 'cashier.edited',
            entityType: 'BarUser',
            entityId: barUser._id,
            metadata: { cashierUserId: user._id, isActive: barUser.isActive },
        });

        res.status(200).json(toCashierDTO(barUser, user));
    };
}
