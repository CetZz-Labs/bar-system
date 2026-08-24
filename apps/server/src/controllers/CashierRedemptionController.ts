import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Redemption, { RedemptionStatus, IRedemption } from "../models/Redemption";
import Reward from "../models/Reward";
import Outing, { OutingStatus, IOuting } from "../models/Outing";
import Group from "../models/Group";
import User, { MembershipRole } from "../models/User";
import Notification, { NotificationType } from "../models/Notification";
import AuditLog, { AuditAction } from "../models/AuditLog";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import { validate, isBlocked, registerFailedAttempt, resetAttempts } from "../utils/redemptionQr";
import { expireStaleRedemptions } from "../utils/redemptionExpiry";
import { getAvailablePointsForBar } from "../utils/redemptionAvailability";
import { emitAvailablePointsForBar } from "../websocket/pointsHub";

// LB-69: validación/entrega de un canje de recompensa (LB-68) por el
// CAJERO. Dirección inversa a LeaderConsumptionController (LB-61): ahí el
// cajero genera y el líder confirma; acá el líder ya generó el canje
// (RedemptionController.create) y es el cajero quien lo resuelve — por eso
// este controller corre con `authenticateCashier`/`req.cashierContext`, no
// con `authenticate()`/`req.user` (ver progress/explorers/exp_LB-69.md §4).

type CashierContext = NonNullable<Request['cashierContext']>;

type ResolveResult =
    | { ok: true; redemption: IRedemption; outing: IOuting }
    | { ok: false; status: number; message: string };

// Mensaje genérico deliberado para códigos inválidos/de otro bar (mismo
// criterio anti-enumeración que LeaderConsumptionController.lookup: no se
// filtra el motivo exacto de por qué un código no sirve).
const GENERIC_INVALID_MESSAGE = 'Código o QR inválido';

function toRejectionMessage(status: RedemptionStatus): string {
    switch (status) {
        case RedemptionStatus.VALIDATED:
        case RedemptionStatus.REJECTED:
            return 'Este canje ya fue procesado';
        case RedemptionStatus.EXPIRED:
            return 'Este código venció, pedile al líder que genere uno nuevo';
        case RedemptionStatus.CANCELLED:
            return 'Este canje fue cancelado por el líder del grupo';
        case RedemptionStatus.ABANDONED:
        default:
            // Único motivo real de ABANDONED hoy (ver closeOuting.ts): la
            // salida se cerró antes de que el cajero llegara a validar.
            return 'La salida se cerró, este canje ya no puede entregarse';
    }
}

export class CashierRedemptionController {
    /**
     * Resuelve un `tokenOrCode` a un `Redemption` HELD vigente, scoped al
     * bar del cajero autenticado. Aplica rate limiting, expiración lazy
     * puntual (utils/redemptionExpiry.ts) y el re-chequeo de la salida
     * asociada. Compartido por `lookup` y `validate` para no duplicar la
     * cadena de validaciones del ticket.
     */
    private static async resolveHeldRedemption(
        tokenOrCode: string,
        cashierUserId: string,
        cashierBarId: string
    ): Promise<ResolveResult> {
        if (isBlocked(cashierUserId)) {
            return {
                ok: false,
                status: 429,
                message: 'Demasiados intentos fallidos. Probá de nuevo en 10 minutos.',
            };
        }

        const result = await validate(tokenOrCode);
        if (!result.valid || !result.redemptionId) {
            registerFailedAttempt(cashierUserId);
            return { ok: false, status: 403, message: GENERIC_INVALID_MESSAGE };
        }

        // Expiración lazy puntual sobre ESTE documento (filtro por _id) antes
        // de re-leerlo, mismo patrón que RedemptionController.list pero
        // acotado a un único canje ya resuelto.
        await expireStaleRedemptions({ _id: result.redemptionId });

        const redemption = await Redemption.findById(result.redemptionId);
        if (!redemption) {
            registerFailedAttempt(cashierUserId);
            return { ok: false, status: 403, message: GENERIC_INVALID_MESSAGE };
        }

        if (redemption.bar.toString() !== cashierBarId) {
            // No filtramos que el canje existe pero es de otro bar: mismo
            // mensaje genérico que un código inexistente.
            registerFailedAttempt(cashierUserId);
            return { ok: false, status: 403, message: GENERIC_INVALID_MESSAGE };
        }

        if (redemption.status !== RedemptionStatus.HELD) {
            resetAttempts(cashierUserId);
            return { ok: false, status: 409, message: toRejectionMessage(redemption.status) };
        }

        const outing = await Outing.findById(redemption.outing);
        if (!outing || outing.status !== OutingStatus.ACTIVE) {
            resetAttempts(cashierUserId);
            return { ok: false, status: 409, message: toRejectionMessage(RedemptionStatus.ABANDONED) };
        }

        resetAttempts(cashierUserId);
        return { ok: true, redemption, outing };
    }

    private static async getGroupLeaderIds(groupId: string): Promise<Types.ObjectId[]> {
        const group = await Group.findById(groupId).select('memberships').lean();
        const leaders = (group?.memberships ?? []).filter(
            (m) => m.role === MembershipRole.LEADER || m.role === MembershipRole.CO_LEADER
        );
        return leaders.map((m) => m.user);
    }

    /**
     * POST /api/redemptions/:tokenOrCode/lookup
     * Preview de solo lectura para que el cajero confirme en el modal antes
     * de decidir "Entregar"/"Rechazar" — no muta nada.
     */
    static lookup = async (req: Request, res: Response) => {
        try {
            const cashierContext = req.cashierContext!;
            const tokenOrCode = String(req.params.tokenOrCode).trim();

            const resolved = await CashierRedemptionController.resolveHeldRedemption(
                tokenOrCode,
                cashierContext.user._id.toString(),
                cashierContext.bar.toString()
            );
            if (!resolved.ok) {
                res.status(resolved.status).json({ message: resolved.message });
                return;
            }

            const { redemption } = resolved;
            const [leader, group] = await Promise.all([
                User.findById(redemption.leader).select('name lastName').lean(),
                Group.findById(redemption.group).select('name').lean(),
            ]);

            res.status(200).json({
                redemptionId: redemption._id.toString(),
                group: { id: redemption.group.toString(), name: group?.name ?? '' },
                leader: {
                    id: redemption.leader.toString(),
                    name: leader ? `${leader.name} ${leader.lastName}`.trim() : '',
                },
                rewardName: redemption.rewardNameSnapshot,
                pointsRequired: redemption.pointsRequiredSnapshot,
                createdAt: redemption.createdAt,
                expiresAt: redemption.expiresAt,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al buscar el canje' });
        }
    };

    /**
     * POST /api/redemptions/:tokenOrCode/validate
     * Body: { action: 'deliver' | 'reject', reason?: string }
     */
    static validate = async (req: Request, res: Response) => {
        try {
            const cashierContext = req.cashierContext!;
            const tokenOrCode = String(req.params.tokenOrCode).trim();
            const { action, reason } = req.body as { action: 'deliver' | 'reject'; reason?: string };

            const resolved = await CashierRedemptionController.resolveHeldRedemption(
                tokenOrCode,
                cashierContext.user._id.toString(),
                cashierContext.bar.toString()
            );
            if (!resolved.ok) {
                res.status(resolved.status).json({ message: resolved.message });
                return;
            }

            if (action === 'deliver') {
                await CashierRedemptionController.deliver(req, res, resolved.redemption, cashierContext);
                return;
            }

            await CashierRedemptionController.reject(req, res, resolved.redemption, cashierContext, reason!.trim());
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al validar el canje' });
        }
    };

    private static async deliver(
        req: Request,
        res: Response,
        redemption: IRedemption,
        cashierContext: CashierContext
    ): Promise<void> {
        const session = await mongoose.startSession();
        let doc!: IRedemption;
        let pointsBalanceAfter = 0;
        let stockAfter: number | null = null;

        try {
            session.startTransaction();

            // Double-check anti-carrera: re-leer el documento fresco dentro
            // de la transacción antes de mutar (mismo patrón que
            // LeaderConsumptionController.accept).
            const fresh = await Redemption.findById(redemption._id).session(session);
            if (!fresh || fresh.status !== RedemptionStatus.HELD) {
                await session.abortTransaction();
                res.status(409).json({ message: 'Este canje ya fue procesado' });
                return;
            }

            fresh.status = RedemptionStatus.VALIDATED;
            fresh.invalidatedAt = new Date();
            fresh.cashier = cashierContext.user._id;
            fresh.validatedAt = new Date();
            await fresh.save({ session });
            doc = fresh;

            // Débito definitivo de puntos (getAvailablePointsForBar solo
            // resta HELD, ver utils/redemptionAvailability.ts): sin esto el
            // saldo disponible "volvería a subir" al salir de HELD.
            await PointsTransaction.create(
                [
                    {
                        group: doc.group,
                        outing: doc.outing,
                        bar: doc.bar,
                        type: PointsTransactionType.REDEMPTION,
                        amount: -doc.pointsRequiredSnapshot,
                        label: `Canje entregado: ${doc.rewardNameSnapshot}`,
                        redemption: doc._id,
                    },
                ],
                { session }
            );

            const updatedGroup = await Group.findByIdAndUpdate(
                doc.group,
                { $inc: { pointsBalance: -doc.pointsRequiredSnapshot } },
                { new: true, session }
            ).select('pointsBalance');
            pointsBalanceAfter = updatedGroup?.pointsBalance ?? 0;

            // Stock definitivo: getAvailableStock también solo resta HELD,
            // así que hace falta este decremento directo para que quede fijo.
            const reward = await Reward.findById(doc.reward).session(session);
            if (reward && !reward.unlimitedStock) {
                const updatedReward = await Reward.findByIdAndUpdate(
                    reward._id,
                    { $inc: { stock: -1 } },
                    { new: true, session }
                ).select('stock');
                stockAfter = updatedReward?.stock ?? null;
            }

            await session.commitTransaction();
        } catch (err) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }
            throw err;
        } finally {
            session.endSession();
        }

        await AuditLog.create({
            bar: doc.bar,
            user: cashierContext.user._id,
            action: AuditAction.REDEMPTION_VALIDATED,
            amount: doc.pointsRequiredSnapshot,
            outing: doc.outing,
            group: doc.group,
            redemption: doc._id,
            deviceInfo: cashierContext.shift.deviceInfo,
            ip: req.ip,
        });

        const leaderIds = await CashierRedemptionController.getGroupLeaderIds(doc.group.toString());
        if (leaderIds.length > 0) {
            await Notification.insertMany(
                leaderIds.map((userId) => ({
                    user: userId,
                    type: NotificationType.REDEMPTION_VALIDATED,
                    message: `Tu canje de "${doc.rewardNameSnapshot}" fue entregado en el bar`,
                    relatedOuting: doc.outing,
                    read: false,
                }))
            );
        }

        const availablePoints = await getAvailablePointsForBar(doc.group.toString(), doc.bar.toString());
        emitAvailablePointsForBar(doc.group.toString(), doc.bar.toString(), availablePoints);

        res.status(200).json({
            redemptionId: doc._id.toString(),
            status: doc.status,
            pointsBalance: pointsBalanceAfter,
            stockRemaining: stockAfter,
            availablePoints,
        });
    }

    private static async reject(
        req: Request,
        res: Response,
        redemption: IRedemption,
        cashierContext: CashierContext,
        reason: string
    ): Promise<void> {
        const session = await mongoose.startSession();
        let doc!: IRedemption;

        try {
            session.startTransaction();

            const fresh = await Redemption.findById(redemption._id).session(session);
            if (!fresh || fresh.status !== RedemptionStatus.HELD) {
                await session.abortTransaction();
                res.status(409).json({ message: 'Este canje ya fue procesado' });
                return;
            }

            // LB-69 es one-shot: a diferencia de LeaderConsumptionController
            // (rejectCount/MAX_REJECTS -> DISPUTED), acá un rechazo simple
            // resuelve el canje. `Redemption` ni siquiera tiene `rejectCount`.
            fresh.status = RedemptionStatus.REJECTED;
            fresh.rejectionReason = reason;
            fresh.invalidatedAt = new Date();
            fresh.cashier = cashierContext.user._id;
            fresh.validatedAt = new Date();
            await fresh.save({ session });
            doc = fresh;

            await session.commitTransaction();
        } catch (err) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }
            throw err;
        } finally {
            session.endSession();
        }

        await AuditLog.create({
            bar: doc.bar,
            user: cashierContext.user._id,
            action: AuditAction.REDEMPTION_REJECTED,
            amount: doc.pointsRequiredSnapshot,
            outing: doc.outing,
            group: doc.group,
            redemption: doc._id,
            deviceInfo: cashierContext.shift.deviceInfo,
            ip: req.ip,
        });

        const leaderIds = await CashierRedemptionController.getGroupLeaderIds(doc.group.toString());
        if (leaderIds.length > 0) {
            await Notification.insertMany(
                leaderIds.map((userId) => ({
                    user: userId,
                    type: NotificationType.REDEMPTION_REJECTED,
                    message: `Tu canje de "${doc.rewardNameSnapshot}" fue rechazado por el bar: ${reason}`,
                    relatedOuting: doc.outing,
                    read: false,
                }))
            );
        }

        // No hay nada que mutar para "liberar": el canje deja de contar como
        // HELD en getAvailablePointsForBar/getAvailableStock apenas cambia
        // de estado (ver utils/redemptionAvailability.ts).
        const availablePoints = await getAvailablePointsForBar(doc.group.toString(), doc.bar.toString());
        emitAvailablePointsForBar(doc.group.toString(), doc.bar.toString(), availablePoints);

        res.status(200).json({
            redemptionId: doc._id.toString(),
            status: doc.status,
            rejectionReason: doc.rejectionReason,
            availablePoints,
        });
    }
}
