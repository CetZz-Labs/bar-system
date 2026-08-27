import { Request, Response } from "express";
import mongoose from "mongoose";
import Consumption, { ConsumptionStatus } from "../models/Consumption";
import Outing, { OutingStatus } from "../models/Outing";
import Group from "../models/Group";
import Bar from "../models/Bar";
import Notification, { NotificationType } from "../models/Notification";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import { MembershipRole } from "../models/User";
import { writeAuditLog } from "../utils/auditLogService";
import { sendPushToUsers } from "../utils/pushService";
import {
    validate,
    invalidate,
    isBlocked,
    registerFailedAttempt,
    resetAttempts,
} from "../utils/consumptionQr";
import { pointsFromAmount } from "../utils/consumptionPoints";
import { awardAttendancePointsIfFirst } from "../utils/attendancePoints";
import { emitGroupPointsBalance, emitPointsMovement } from "../websocket/pointsHub";

const MAX_REJECTS = 4;

async function assertLeaderOrCoLeader(groupId: string, userId: string): Promise<boolean> {
    const group = await Group.findById(groupId).select('memberships').lean();
    if (!group) return false;
    const membership = group.memberships.find((m) => m.user.toString() === userId);
    if (!membership) return false;
    return membership.role === MembershipRole.LEADER || membership.role === MembershipRole.CO_LEADER;
}

export class LeaderConsumptionController {
    /**
     * POST /api/consumptions/lookup
     * Body: { tokenOrCode }
     */
    static lookup = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { tokenOrCode } = req.body as { tokenOrCode: string };

            if (isBlocked(userId)) {
                res.status(429).json({
                    message: 'Demasiados intentos fallidos. Probá de nuevo en 10 minutos.',
                });
                return;
            }

            const result = await validate(String(tokenOrCode).trim());
            if (!result.valid || !result.consumptionId) {
                registerFailedAttempt(userId);
                res.status(403).json({ message: 'código inválido' });
                return;
            }

            const consumption = await Consumption.findById(result.consumptionId).lean();
            if (!consumption) {
                registerFailedAttempt(userId);
                res.status(403).json({ message: 'código inválido' });
                return;
            }

            if (
                consumption.status !== ConsumptionStatus.PENDING_LEADER_CONFIRMATION &&
                consumption.status !== ConsumptionStatus.REJECTED
            ) {
                // PENDING is the only confirmable; REJECTED needs new QR first
                if (consumption.status === ConsumptionStatus.CONFIRMED) {
                    resetAttempts(userId);
                    res.status(409).json({ message: 'Este consumo ya fue confirmado' });
                    return;
                }
                if (consumption.status === ConsumptionStatus.DISPUTED) {
                    resetAttempts(userId);
                    res.status(409).json({
                        message: 'Este consumo está en disputa y no puede confirmarse',
                    });
                    return;
                }
            }

            if (consumption.status === ConsumptionStatus.REJECTED) {
                resetAttempts(userId);
                res.status(409).json({
                    message: 'Este consumo fue rechazado. Pedile al cajero un código nuevo.',
                });
                return;
            }

            const outing = await Outing.findById(consumption.outing).lean();
            if (!outing || outing.status !== OutingStatus.ACTIVE) {
                registerFailedAttempt(userId);
                res.status(403).json({ message: 'código inválido' });
                return;
            }

            const allowed = await assertLeaderOrCoLeader(outing.group.toString(), userId);
            if (!allowed) {
                registerFailedAttempt(userId);
                res.status(403).json({ message: 'código inválido' });
                return;
            }

            resetAttempts(userId);

            const bar = await Bar.findById(consumption.bar).select('name').lean();

            res.status(200).json({
                consumptionId: consumption._id,
                amount: consumption.amount,
                breakdown: consumption.breakdown,
                status: consumption.status,
                createdAt: consumption.createdAt,
                bar: {
                    id: consumption.bar,
                    name: bar?.name ?? '',
                },
                outingId: outing._id,
                groupId: outing.group,
                rejectCount: consumption.rejectCount ?? 0,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al buscar el consumo' });
        }
    };

    /**
     * POST /api/consumptions/:consumptionId/accept
     */
    static accept = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const consumptionId = req.params.consumptionId as string;

            const consumption = await Consumption.findById(consumptionId);
            if (!consumption) {
                res.status(404).json({ message: 'Consumo no encontrado' });
                return;
            }

            // Idempotencia: ya confirmado
            if (consumption.status === ConsumptionStatus.CONFIRMED) {
                const group = await Group.findById(
                    (await Outing.findById(consumption.outing).select('group').lean())?.group
                )
                    .select('pointsBalance')
                    .lean();
                res.status(200).json({
                    consumptionId: consumption._id,
                    status: consumption.status,
                    pointsAwarded: consumption.pointsAwarded ?? 0,
                    pointsBalance: group?.pointsBalance ?? 0,
                    alreadyConfirmed: true,
                });
                return;
            }

            if (consumption.status !== ConsumptionStatus.PENDING_LEADER_CONFIRMATION) {
                res.status(409).json({
                    message: 'Este consumo no puede confirmarse en su estado actual',
                });
                return;
            }

            const outing = await Outing.findById(consumption.outing);
            if (!outing || outing.status !== OutingStatus.ACTIVE) {
                res.status(409).json({ message: 'La salida no está en curso' });
                return;
            }

            const allowed = await assertLeaderOrCoLeader(outing.group.toString(), userId);
            if (!allowed) {
                res.status(403).json({ message: 'código inválido' });
                return;
            }

            const points = pointsFromAmount(consumption.amount);
            const session = await mongoose.startSession();
            let pointsBalance = 0;

            try {
                session.startTransaction();

                const fresh = await Consumption.findById(consumptionId).session(session);
                if (!fresh || fresh.status !== ConsumptionStatus.PENDING_LEADER_CONFIRMATION) {
                    await session.abortTransaction();
                    res.status(409).json({ message: 'Este consumo ya fue procesado' });
                    return;
                }

                fresh.status = ConsumptionStatus.CONFIRMED;
                fresh.pointsAwarded = points;
                fresh.invalidatedAt = new Date();
                await fresh.save({ session });

                if (points > 0) {
                    const updatedGroup = await Group.findByIdAndUpdate(
                        outing.group,
                        { $inc: { pointsBalance: points } },
                        { new: true, session }
                    ).select('pointsBalance');
                    pointsBalance = updatedGroup?.pointsBalance ?? 0;

                    await PointsTransaction.create(
                        [
                            {
                                group: outing.group,
                                outing: outing._id,
                                bar: consumption.bar,
                                type: PointsTransactionType.CONSUMPTION,
                                amount: points,
                                label: `Consumo $${consumption.amount}`,
                                consumption: fresh._id,
                            },
                        ],
                        { session }
                    );
                } else {
                    const g = await Group.findById(outing.group).select('pointsBalance').session(session);
                    pointsBalance = g?.pointsBalance ?? 0;
                }

                await session.commitTransaction();
            } catch (err) {
                await session.abortTransaction();
                throw err;
            } finally {
                session.endSession();
            }

            // Fuera de la txn: attendance + audit + WS
            await awardAttendancePointsIfFirst(outing._id.toString());

            const groupAfter = await Group.findById(outing.group).select('pointsBalance').lean();
            pointsBalance = groupAfter?.pointsBalance ?? pointsBalance;

            writeAuditLog({
                bar: consumption.bar,
                actorType: 'LEADER',
                actorId: req.user!._id,
                eventType: 'consumo.confirmed',
                entityType: 'Consumo',
                entityId: consumption._id,
                metadata: {
                    consumptionId: consumption._id,
                    amount: consumption.amount,
                    pointsAwarded: points,
                },
                ip: req.ip,
            });

            const barDoc = await Bar.findById(consumption.bar).select("name").lean();
            const barPoints = await PointsTransaction.aggregate<{ points: number }>([
                {
                    $match: {
                        group: outing.group,
                        bar: consumption.bar,
                    },
                },
                { $group: { _id: null, points: { $sum: "$amount" } } },
            ]);
            const newBarBalance = barPoints[0]?.points ?? points;

            emitGroupPointsBalance(outing.group.toString(), pointsBalance, {
                barId: consumption.bar.toString(),
                newBalance: newBarBalance,
                delta: points,
                reason: "consumo",
            });

            if (points > 0) {
                emitPointsMovement({
                    id: consumption._id.toString(),
                    groupId: outing.group.toString(),
                    barId: consumption.bar.toString(),
                    barName: barDoc?.name ?? "Bar",
                    type: "consumo",
                    points,
                    createdAt: new Date().toISOString(),
                    metadata: { amount: consumption.amount },
                });
            }

            res.status(200).json({
                consumptionId: consumption._id,
                status: ConsumptionStatus.CONFIRMED,
                pointsAwarded: points,
                pointsBalance,
                alreadyConfirmed: false,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al confirmar el consumo' });
        }
    };

    /**
     * POST /api/consumptions/:consumptionId/reject
     */
    static reject = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const consumptionId = req.params.consumptionId as string;

            const consumption = await Consumption.findById(consumptionId);
            if (!consumption) {
                res.status(404).json({ message: 'Consumo no encontrado' });
                return;
            }

            if (consumption.status === ConsumptionStatus.DISPUTED) {
                res.status(409).json({ message: 'Este consumo ya está en disputa' });
                return;
            }

            if (consumption.status === ConsumptionStatus.CONFIRMED) {
                res.status(409).json({ message: 'Este consumo ya fue confirmado' });
                return;
            }

            if (consumption.status !== ConsumptionStatus.PENDING_LEADER_CONFIRMATION) {
                res.status(409).json({
                    message: 'Este consumo no puede rechazarse en su estado actual',
                });
                return;
            }

            const outing = await Outing.findById(consumption.outing).lean();
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            const allowed = await assertLeaderOrCoLeader(outing.group.toString(), userId);
            if (!allowed) {
                res.status(403).json({ message: 'código inválido' });
                return;
            }

            const nextRejects = (consumption.rejectCount ?? 0) + 1;
            consumption.rejectCount = nextRejects;
            await invalidate(consumption._id.toString());
            consumption.invalidatedAt = new Date();

            if (nextRejects >= MAX_REJECTS) {
                consumption.status = ConsumptionStatus.DISPUTED;
                await consumption.save();

                const group = await Group.findById(outing.group).select('memberships').lean();
                const leaders = (group?.memberships ?? []).filter(
                    (m) =>
                        m.role === MembershipRole.LEADER || m.role === MembershipRole.CO_LEADER
                );

                if (leaders.length > 0) {
                    await Notification.insertMany(
                        leaders.map((m) => ({
                            user: m.user,
                            type: NotificationType.CONSUMPTION_DISPUTED,
                            message:
                                'consumo en disputa por rechazos repetidos, avisá al bar',
                            relatedOuting: outing._id,
                            read: false,
                        }))
                    );
                }

                writeAuditLog({
                    bar: consumption.bar,
                    actorType: 'LEADER',
                    actorId: req.user!._id,
                    eventType: 'dispute.opened',
                    entityType: 'Consumo',
                    entityId: consumption._id,
                    metadata: { consumptionId: consumption._id, amount: consumption.amount },
                    ip: req.ip,
                });

                // LB-80: push a los mismos LEADER/CO_LEADER de la
                // notificación in-app. Fire-and-forget, SIN await, post-commit
                // (este flujo no usa transacción).
                sendPushToUsers(
                    leaders.map((m) => m.user),
                    {
                        category: 'consumos',
                        title: 'Consumo en disputa',
                        body: 'consumo en disputa por rechazos repetidos, avisá al bar',
                        relatedOuting: outing._id.toString(),
                    },
                );

                res.status(200).json({
                    consumptionId: consumption._id,
                    status: consumption.status,
                    rejectCount: nextRejects,
                });
                return;
            }

            consumption.status = ConsumptionStatus.REJECTED;
            await consumption.save();

            writeAuditLog({
                bar: consumption.bar,
                actorType: 'LEADER',
                actorId: req.user!._id,
                eventType: 'consumo.rejected',
                entityType: 'Consumo',
                entityId: consumption._id,
                metadata: { consumptionId: consumption._id, amount: consumption.amount },
                ip: req.ip,
            });

            res.status(200).json({
                consumptionId: consumption._id,
                status: consumption.status,
                rejectCount: nextRejects,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al rechazar el consumo' });
        }
    };
}
