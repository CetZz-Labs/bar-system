import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Redemption, { RedemptionStatus, IRedemption } from "../models/Redemption";
import Reward, { RewardStatus } from "../models/Reward";
import Outing, { OutingStatus } from "../models/Outing";
import Group from "../models/Group";
import { MembershipRole } from "../models/User";
import { writeAuditLog } from "../utils/auditLogService";
import { generate } from "../utils/redemptionQr";
import { getAvailablePointsForBar, getAvailableStock } from "../utils/redemptionAvailability";
import { expireStaleRedemptions } from "../utils/redemptionExpiry";
import { emitAvailablePointsForBar } from "../websocket/pointsHub";

// LB-68: inicio de canje de recompensa (líder) — QR + reserva. La
// validación/entrega por el cajero es LB-69 (fuera de este alcance).

// Duplicado intencional del guard líder/co-líder ya usado en
// LeaderConsumptionController.ts (que a su vez replica el criterio de
// OutingController.getLeaderOrCoLeaderRole) — no se extrae a utils/ para no
// tocar esos archivos fuera del alcance de este ticket, mismo criterio ya
// documentado en progress/implementers/impl_LB-67.md para
// isMongoDuplicateKeyError.
async function assertLeaderOrCoLeader(groupId: string, userId: string): Promise<boolean> {
    const group = await Group.findById(groupId).select('memberships').lean();
    if (!group) return false;
    const membership = group.memberships.find((m) => m.user.toString() === userId);
    if (!membership) return false;
    return membership.role === MembershipRole.LEADER || membership.role === MembershipRole.CO_LEADER;
}

interface RedemptionDTO {
    id: string;
    group: string;
    outing: string;
    bar: string;
    reward: string;
    rewardName: string;
    pointsRequired: number;
    status: RedemptionStatus;
    manualCode: string;
    expiresAt: Date;
    createdAt: Date;
}

function toRedemptionDTO(redemption: IRedemption): RedemptionDTO {
    return {
        id: redemption._id.toString(),
        group: redemption.group.toString(),
        outing: redemption.outing.toString(),
        bar: redemption.bar.toString(),
        reward: redemption.reward.toString(),
        rewardName: redemption.rewardNameSnapshot,
        pointsRequired: redemption.pointsRequiredSnapshot,
        status: redemption.status,
        manualCode: redemption.manualCode,
        expiresAt: redemption.expiresAt,
        createdAt: redemption.createdAt,
    };
}

export class RedemptionController {
    /**
     * POST /api/groups/:groupId/redemptions
     * Body: { rewardId }
     * Solo líder/co-líder del grupo, con check-in activo en el bar dueño de
     * la recompensa. Reserva (HELD) puntos + stock sin mutar Group/Reward:
     * la disponibilidad se recalcula en vivo (utils/redemptionAvailability.ts).
     */
    static create = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const groupId = req.params.groupId as string;
            const { rewardId } = req.body as { rewardId: string };

            const allowed = await assertLeaderOrCoLeader(groupId, userId);
            if (!allowed) {
                res.status(403).json({ message: 'Solo el líder o co-líder del grupo puede generar un canje' });
                return;
            }

            const reward = await Reward.findOne({ _id: rewardId, deletedAt: null });
            if (!reward) {
                res.status(404).json({ message: 'Recompensa no encontrada' });
                return;
            }

            if (reward.status !== RewardStatus.ACTIVE) {
                res.status(409).json({ message: 'Esta recompensa ya no está disponible' });
                return;
            }

            // Check-in activo en el bar dueño de la recompensa (mismo criterio
            // que RewardController.getAvailableRewards).
            const outing = await Outing.findOne({
                group: groupId,
                bar: reward.bar,
                status: OutingStatus.ACTIVE,
            });
            if (!outing) {
                res.status(403).json({
                    message: 'Necesitás un check-in activo en el bar de la recompensa para canjearla',
                });
                return;
            }

            // Credenciales del canje: función pura, no persiste (mismo criterio
            // que ConsumptionController.createConsumption con consumptionQr.generate).
            const redemptionId = new Types.ObjectId();
            const { qrData, qrToken, manualCode, expiresAt } = await generate(redemptionId.toString());

            const session = await mongoose.startSession();
            let redemption: IRedemption;

            try {
                session.startTransaction();

                // Doble-check de disponibilidad DENTRO de la transacción (mismo
                // patrón que LeaderConsumptionController.accept) para minimizar
                // la ventana de carrera entre dos holds simultáneos.
                const freshReward = await Reward.findById(reward._id).session(session);
                if (!freshReward || freshReward.deletedAt || freshReward.status !== RewardStatus.ACTIVE) {
                    await session.abortTransaction();
                    res.status(409).json({ message: 'Esta recompensa ya no está disponible' });
                    return;
                }

                const availablePoints = await getAvailablePointsForBar(groupId, reward.bar.toString(), session);
                if (availablePoints < freshReward.pointsRequired) {
                    await session.abortTransaction();
                    res.status(409).json({ message: 'No tenés suficientes puntos disponibles en este bar' });
                    return;
                }

                const availableStock = await getAvailableStock(freshReward, session);
                if (availableStock !== null && availableStock <= 0) {
                    await session.abortTransaction();
                    res.status(409).json({ message: 'No queda stock disponible de esta recompensa' });
                    return;
                }

                const created = await Redemption.create(
                    [
                        {
                            _id: redemptionId,
                            group: groupId,
                            outing: outing._id,
                            bar: freshReward.bar,
                            reward: freshReward._id,
                            leader: userId,
                            rewardNameSnapshot: freshReward.name,
                            pointsRequiredSnapshot: freshReward.pointsRequired,
                            status: RedemptionStatus.HELD,
                            qrToken,
                            manualCode,
                            expiresAt,
                        },
                    ],
                    { session }
                );

                redemption = created[0];

                await session.commitTransaction();
            } catch (err) {
                if (session.inTransaction()) {
                    await session.abortTransaction().catch(() => { });
                }
                throw err;
            } finally {
                session.endSession();
            }

            writeAuditLog({
                bar: redemption.bar,
                actorType: 'LEADER',
                actorId: req.user!._id,
                eventType: 'redemption.generated',
                entityType: 'Canje',
                entityId: redemption._id,
                metadata: {
                    redemptionId: redemption._id,
                    rewardId: redemption.reward,
                    pointsSpent: redemption.pointsRequiredSnapshot,
                    outingId: outing._id,
                },
                ip: req.ip,
            });

            const availablePointsAfter = await getAvailablePointsForBar(groupId, reward.bar.toString());
            emitAvailablePointsForBar(groupId, reward.bar.toString(), availablePointsAfter);

            res.status(201).json({
                ...toRedemptionDTO(redemption),
                qrData,
                availablePoints: availablePointsAfter,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al generar el canje' });
        }
    };

    /**
     * PATCH /api/groups/:groupId/redemptions/:id/cancel
     * Solo líder/co-líder del grupo dueño del canje. Idempotente si ya
     * estaba CANCELLED. No hay nada que "liberar" en persistencia (la
     * disponibilidad se calcula en vivo): solo cambia `status`.
     */
    static cancel = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const groupId = req.params.groupId as string;
            const redemptionId = req.params.id as string;

            // Scoped por groupId (mismo criterio que OutingController.cancelOuting
            // con Outing.findOne({_id, group})): un canje solo puede cancelarse a
            // través de la ruta anidada del grupo al que pertenece.
            const redemption = await Redemption.findOne({ _id: redemptionId, group: groupId });
            if (!redemption) {
                res.status(404).json({ message: 'Canje no encontrado' });
                return;
            }

            const allowed = await assertLeaderOrCoLeader(redemption.group.toString(), userId);
            if (!allowed) {
                res.status(403).json({ message: 'Solo el líder o co-líder del grupo puede cancelar este canje' });
                return;
            }

            // Idempotencia: un doble tap sobre "cancelar" no debe fallar ni re-auditar.
            if (redemption.status === RedemptionStatus.CANCELLED) {
                res.status(200).json(toRedemptionDTO(redemption));
                return;
            }

            if (redemption.status !== RedemptionStatus.HELD) {
                res.status(409).json({ message: 'Este canje no puede cancelarse en su estado actual' });
                return;
            }

            // Si ya venció, la expiración lazy tiene prioridad sobre la
            // cancelación manual: se resuelve como EXPIRED, no CANCELLED.
            if (redemption.expiresAt.getTime() < Date.now()) {
                redemption.status = RedemptionStatus.EXPIRED;
                redemption.invalidatedAt = new Date();
                await redemption.save();

                writeAuditLog({
                    bar: redemption.bar,
                    actorType: 'LEADER',
                    actorId: req.user!._id,
                    eventType: 'redemption.expired',
                    entityType: 'Canje',
                    entityId: redemption._id,
                    metadata: { redemptionId: redemption._id, rewardId: redemption.reward },
                    ip: req.ip,
                });

                const availablePointsAfter = await getAvailablePointsForBar(
                    redemption.group.toString(),
                    redemption.bar.toString()
                );
                emitAvailablePointsForBar(redemption.group.toString(), redemption.bar.toString(), availablePointsAfter);

                res.status(409).json({ message: 'Este canje ya expiró' });
                return;
            }

            redemption.status = RedemptionStatus.CANCELLED;
            redemption.invalidatedAt = new Date();
            await redemption.save();

            writeAuditLog({
                bar: redemption.bar,
                actorType: 'LEADER',
                actorId: req.user!._id,
                eventType: 'redemption.cancelled',
                entityType: 'Canje',
                entityId: redemption._id,
                metadata: { redemptionId: redemption._id, rewardId: redemption.reward },
                ip: req.ip,
            });

            const availablePointsAfter = await getAvailablePointsForBar(
                redemption.group.toString(),
                redemption.bar.toString()
            );
            emitAvailablePointsForBar(redemption.group.toString(), redemption.bar.toString(), availablePointsAfter);

            res.status(200).json(toRedemptionDTO(redemption));
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al cancelar el canje' });
        }
    };

    /**
     * GET /api/groups/:groupId/redemptions
     * Solo líder/co-líder del grupo. Antes de responder, aplica la
     * expiración lazy de los HELD vencidos (utils/redemptionExpiry.ts).
     * Devuelve los canjes más recientes del grupo (pendientes + resueltos).
     */
    static list = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const groupId = req.params.groupId as string;

            const allowed = await assertLeaderOrCoLeader(groupId, userId);
            if (!allowed) {
                res.status(403).json({ message: 'Solo el líder o co-líder del grupo puede ver los canjes' });
                return;
            }

            await expireStaleRedemptions({ group: groupId });

            const redemptions = await Redemption.find({ group: groupId })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

            res.status(200).json(redemptions.map(toRedemptionDTO));
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener los canjes' });
        }
    };
}

// NOTA (segunda pasada, LB-68): el endpoint `getAvailablePoints`
// (GET /api/redemptions/available-points?groupId=) de la primera pasada se
// eliminó por decisión del Implementer — quedó redundante con
// `GET /api/groups/:groupId/rewards` de LB-72 (GroupRewardsController.getAvailable),
// que ya expone `{ rewards, balance }` combinando lo mismo (bar resuelto vía
// Outing ACTIVE + getAvailablePointsForBar) en un solo round-trip para el
// frontend. Nunca estuvo enrutado (server.ts no lo montaba), así que no es
// un cambio de contrato público — solo se retira código muerto. Ver
// progress/implementers/impl_LB-68.md para el detalle de la decisión.
