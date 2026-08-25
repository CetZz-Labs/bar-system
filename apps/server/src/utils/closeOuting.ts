import mongoose, { Types } from 'mongoose';
import Outing, {
    ClosureReason,
    IOuting,
    IOutingSummary,
    OutingStatus,
} from '../models/Outing';

export { ClosureReason };
import Consumption, { ConsumptionStatus } from '../models/Consumption';
import PointsTransaction from '../models/PointsTransaction';
import Redemption, { RedemptionStatus } from '../models/Redemption';
import Group from '../models/Group';
import Bar from '../models/Bar';
import Notification, { NotificationType } from '../models/Notification';
import { invalidate } from './consumptionQr';
import { invalidate as invalidateRedemption } from './redemptionQr';
import { writeAuditLog } from './auditLogService';

const ABANDONABLE: ConsumptionStatus[] = [
    ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
    ConsumptionStatus.REJECTED,
    ConsumptionStatus.DISPUTED,
];

export type CloseOutingResult = {
    outing: IOuting;
    alreadyClosed: boolean;
    summary: IOutingSummary;
};

export type CloseOutingOptions = {
    reason: ClosureReason;
    /** Cajero que cierra a mano; vacío en auto-cierre. */
    closedBy?: Types.ObjectId | string;
    /** Usuario para audit (en auto-cierre: el cajero que disparó el middleware). */
    actorUserId?: Types.ObjectId | string;
    deviceInfo?: string;
    ip?: string;
};

function isClosedStatus(status: OutingStatus): boolean {
    return status === OutingStatus.COMPLETED || status === OutingStatus.NO_SHOW;
}

async function buildSummary(
    outing: IOuting,
    closedAt: Date,
    abandonedCount: number,
    disputedCount: number,
    session: mongoose.ClientSession
): Promise<IOutingSummary> {
    const confirmed = await Consumption.find({
        outing: outing._id,
        status: ConsumptionStatus.CONFIRMED,
    })
        .session(session)
        .lean();

    const confirmedCount = confirmed.length;
    const totalAmount = confirmed.reduce((sum, c) => sum + (c.amount ?? 0), 0);
    const consumptionPoints = confirmed.reduce((sum, c) => sum + (c.pointsAwarded ?? 0), 0);

    const pointRows = await PointsTransaction.find({ outing: outing._id })
        .session(session)
        .lean();
    const pointsAwarded = pointRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    // Canjes todavía no existen en el MVP; el campo queda en el resumen para el contrato.
    const redemptionCount = 0;

    return {
        checkInCount: outing.checkedInAt ? 1 : 0,
        confirmedCount,
        totalAmount,
        pointsAwarded: pointsAwarded || consumptionPoints,
        redemptionCount,
        abandonedCount,
        disputedCount,
        checkedInAt: outing.checkedInAt,
        closedAt,
    };
}

/**
 * Cierra una salida (LB-62). Idempotente si ya está COMPLETED/NO_SHOW.
 * No acredita puntos. Abandona pendientes + disputas (+ rechazados) e invalida QR.
 */
export async function closeOuting(
    outingId: string,
    options: CloseOutingOptions
): Promise<CloseOutingResult | null> {
    const outing = await Outing.findById(outingId);
    if (!outing) return null;

    if (outing.status === OutingStatus.CANCELLED) {
        throw Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' as const });
    }

    if (isClosedStatus(outing.status) && outing.summary) {
        return {
            outing,
            alreadyClosed: true,
            summary: outing.summary,
        };
    }

    const session = await mongoose.startSession();
    let summary: IOutingSummary;
    let disputedCount = 0;
    let abandonedCount = 0;

    try {
        session.startTransaction();

        const fresh = await Outing.findById(outingId).session(session);
        if (!fresh) {
            await session.abortTransaction();
            return null;
        }

        if (isClosedStatus(fresh.status) && fresh.summary) {
            await session.abortTransaction();
            return { outing: fresh, alreadyClosed: true, summary: fresh.summary };
        }

        if (
            fresh.status !== OutingStatus.PENDING &&
            fresh.status !== OutingStatus.ACTIVE
        ) {
            await session.abortTransaction();
            throw Object.assign(new Error('NOT_CLOSABLE'), { code: 'NOT_CLOSABLE' as const });
        }

        const toAbandon = await Consumption.find({
            outing: fresh._id,
            status: { $in: ABANDONABLE },
        }).session(session);

        disputedCount = toAbandon.filter((c) => c.status === ConsumptionStatus.DISPUTED).length;
        abandonedCount = toAbandon.length;

        // LB-68 (segunda pasada): mismo criterio que arriba para Consumption —
        // libera proactivamente los canjes HELD de la salida al cerrarla, en
        // vez de esperar hasta 20 min de TTL para que la expiración lazy los
        // resuelva. Al salir de HELD, utils/redemptionAvailability.ts ya no
        // los cuenta como reservados.
        const redemptionsToAbandon = await Redemption.find({
            outing: fresh._id,
            status: RedemptionStatus.HELD,
        }).session(session);

        const closedAt = new Date();
        const nextStatus =
            fresh.status === OutingStatus.ACTIVE
                ? OutingStatus.COMPLETED
                : OutingStatus.NO_SHOW;

        for (const consumption of toAbandon) {
            consumption.status = ConsumptionStatus.ABANDONED;
            consumption.invalidatedAt = closedAt;
            await consumption.save({ session });
            await invalidate(consumption._id.toString(), session);
        }

        for (const redemption of redemptionsToAbandon) {
            redemption.status = RedemptionStatus.ABANDONED;
            redemption.invalidatedAt = closedAt;
            await redemption.save({ session });
            await invalidateRedemption(redemption._id.toString(), session);
        }

        // Resumen con conteos ya calculados; confirmed/points se leen de DB
        // (no mutamos CONFIRMED en este cierre).
        summary = await buildSummary(fresh, closedAt, abandonedCount, disputedCount, session);

        fresh.status = nextStatus;
        fresh.closedAt = closedAt;
        fresh.closureReason = options.reason;
        if (options.closedBy) {
            fresh.closedBy = new Types.ObjectId(String(options.closedBy));
        }
        fresh.summary = summary;
        await fresh.save({ session });

        if (summary.confirmedCount >= 1) {
            const group = await Group.findById(fresh.group).select('memberships').session(session).lean();
            const bar = await Bar.findById(fresh.bar).select('name').session(session).lean();
            const members = group?.memberships ?? [];
            if (members.length > 0) {
                await Notification.insertMany(
                    members.map((m) => ({
                        user: m.user,
                        type: NotificationType.OUTING_CLOSED,
                        message: `La salida a ${bar?.name ?? 'el bar'} finalizó. Se confirmaron ${summary.confirmedCount} consumo${summary.confirmedCount === 1 ? '' : 's'}.`,
                        relatedOuting: fresh._id,
                        read: false,
                    })),
                    { session }
                );
            }
        }

        await session.commitTransaction();

        // LB-77: el log de auditoría NUNCA participa de la transacción.
        // Antes vivía dentro (AuditLog.create([...], { session })), con el
        // riesgo de abortar TODO el cierre de salida si la escritura del log
        // fallaba. Se emite DESPUÉS del commit, fire-and-forget, y un fallo
        // aquí no afecta el resultado del cierre.
        if (options.actorUserId) {
            const isAutoClose = options.reason === ClosureReason.BAR_CLOSED;
            writeAuditLog({
                bar: fresh.bar,
                actorType: isAutoClose ? 'SYSTEM' : 'CASHIER',
                ...(isAutoClose
                    ? {}
                    : { actorId: new Types.ObjectId(String(options.actorUserId)) }),
                eventType: 'salida.closed',
                entityType: 'Salida',
                entityId: fresh._id,
                metadata: {
                    outingId: fresh._id,
                    groupId: fresh.group,
                    closureReason: options.reason,
                },
                deviceInfo: options.deviceInfo,
                ip: options.ip,
            });
        }

        return { outing: fresh, alreadyClosed: false, summary };
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction().catch(() => {});
        }
        throw err;
    } finally {
        session.endSession();
    }
}

/** Cierra todas las PENDING/ACTIVE del bar (auto-cierre al horario de cierre). */
export async function closeOutingsForBar(
    barId: string,
    options: Omit<CloseOutingOptions, 'reason'> & { reason?: ClosureReason }
): Promise<number> {
    const open = await Outing.find({
        bar: barId,
        status: { $in: [OutingStatus.PENDING, OutingStatus.ACTIVE] },
    })
        .select('_id')
        .lean();

    let closed = 0;
    for (const row of open) {
        const result = await closeOuting(row._id.toString(), {
            reason: options.reason ?? ClosureReason.BAR_CLOSED,
            closedBy: options.closedBy,
            actorUserId: options.actorUserId,
            deviceInfo: options.deviceInfo,
            ip: options.ip,
        });
        if (result && !result.alreadyClosed) closed += 1;
    }
    return closed;
}
