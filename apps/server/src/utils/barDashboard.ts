import { PipelineStage, Types } from "mongoose";
import Outing, { OutingStatus } from "../models/Outing";
import Consumption, { ConsumptionStatus } from "../models/Consumption";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import Redemption, { RedemptionStatus } from "../models/Redemption";
import Group from "../models/Group";
import User from "../models/User";
import BarUser, { BarUserRole } from "../models/BarUser";
import { getBarDayRange } from "./barDay";
import { POINTS_TO_ARS_RATE } from "./points";

/**
 * Agregaciones del dashboard del bar (LB-74). Primer uso de Mongo
 * `aggregate()`/`$group` en el repo (confirmado sin precedente por el
 * Explorer, ver progress/explorers/exp_LB-74.md §6) — decisión tomada en el
 * contrato técnico (vault Obsidian, bar-dashboard-aggregations.md).
 *
 * Exportado e independiente del controller HTTP a propósito: LB-78 (Juan)
 * reusa estas mismas funciones para reportes exportables, mismo criterio de
 * reuso que `getAvailablePointsForBar` (utils/redemptionAvailability.ts,
 * LB-68/72).
 */

export type DashboardPeriodType = 'today' | 'week' | 'month' | 'custom';

/** Estado derivado por fila de la tabla de actividad (no es Outing.status). */
export type ActivityRowStatus = 'en_curso' | 'finalizada' | 'reservada' | 'disputa';

export interface DashboardRange {
    from: Date;
    to: Date;
}

export interface DashboardFilters {
    cashierId?: string;
    status?: ActivityRowStatus;
}

export interface DashboardStatCards {
    groupsCount: number;
    consumptionTotalArs: number;
    pointsAwarded: {
        consumption: number;
        attendance: number;
        total: number;
    };
    redemptions: {
        count: number;
        arsEquivalent: number;
    };
}

export interface ActivityRow {
    outingId: string;
    groupId: string | null;
    groupName: string;
    checkedInAt: Date | null;
    consumptionArs: number;
    pointsAwarded: number;
    cashierId: string | null;
    cashierName: string | null;
    status: ActivityRowStatus;
}

export interface DisputeRow {
    consumptionId: string;
    outingId: string;
    groupId: string | null;
    groupName: string;
    amount: number;
    cashierId: string | null;
    cashierName: string | null;
    createdAt: Date;
    rejectCount: number;
}

export interface CashierRow {
    cashierId: string;
    cashierName: string;
    checkIns: number;
    consumptionArs: number;
    pointsAwarded: number;
    redemptionsCount: number;
    redemptionsArs: number;
    net: number;
}

export interface CashierTable {
    rows: CashierRow[];
    totals: Omit<CashierRow, 'cashierId' | 'cashierName'>;
}

const MAX_RANGE_MONTHS = 3;

/**
 * `period=today|week|month` se resuelven sobre "día de bar"
 * (`getBarDayRange`/`bar.closingTime`, mismo criterio que LB-59/65), no
 * medianoche calendario. `week`/`month` son ventanas de 7/30 días
 * terminando en el cierre del "día de bar" de hoy (decisión de
 * implementación — el contrato no define un criterio de mes calendario, ver
 * progress/implementers/impl_LB-74.md). `custom` exige `from`/`to`
 * explícitos, tal cual vienen (sin ajuste a día de bar).
 */
export function resolveDashboardPeriod(
    period: DashboardPeriodType,
    fromQuery: string | undefined,
    toQuery: string | undefined,
    closingTime: string,
    now: Date = new Date()
): DashboardRange {
    if (period === 'custom') {
        return { from: new Date(fromQuery!), to: new Date(toQuery!) };
    }

    const todayRange = getBarDayRange(now, closingTime);

    if (period === 'today') {
        return { from: todayRange.start, to: todayRange.end };
    }

    const days = period === 'week' ? 7 : 30;
    const from = new Date(todayRange.end);
    from.setDate(from.getDate() - days);

    return { from, to: todayRange.end };
}

/** True si `to` excede el rango máximo de 3 meses desde `from`. */
export function exceedsMaxRange(from: Date, to: Date): boolean {
    const maxTo = new Date(from);
    maxTo.setMonth(maxTo.getMonth() + MAX_RANGE_MONTHS);
    return to.getTime() > maxTo.getTime();
}

/** Filtro de estado (CONFIRMED, o RESOLVED_BY_OWNER aceptado) que cuenta
 * como consumo válido en todas las agregaciones. */
function validConsumptionStatusMatch(): Record<string, unknown> {
    return {
        $or: [
            { status: ConsumptionStatus.CONFIRMED },
            { status: ConsumptionStatus.RESOLVED_BY_OWNER, resolutionOutcome: 'ACCEPTED' },
        ],
    };
}

export async function getDashboardStatCards(barId: string, range: DashboardRange): Promise<DashboardStatCards> {
    const barObjectId = new Types.ObjectId(barId);
    const { from, to } = range;

    const [groupsResult, consumptionResult, pointsResult, redemptionsResult] = await Promise.all([
        Outing.aggregate<{ count: number }>([
            { $match: { bar: barObjectId, status: { $ne: OutingStatus.CANCELLED } } },
            { $addFields: { anchorDate: { $ifNull: ['$checkedInAt', '$scheduledFor'] } } },
            { $match: { anchorDate: { $gte: from, $lte: to } } },
            { $count: 'count' },
        ]),
        Consumption.aggregate<{ _id: null; total: number }>([
            {
                $match: {
                    bar: barObjectId,
                    createdAt: { $gte: from, $lte: to },
                    ...validConsumptionStatusMatch(),
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        PointsTransaction.aggregate<{ _id: PointsTransactionType; total: number }>([
            {
                $match: {
                    bar: barObjectId,
                    createdAt: { $gte: from, $lte: to },
                    type: { $in: [PointsTransactionType.CONSUMPTION, PointsTransactionType.ATTENDANCE] },
                },
            },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ]),
        Redemption.aggregate<{ _id: null; count: number; pointsTotal: number }>([
            {
                $match: {
                    bar: barObjectId,
                    status: RedemptionStatus.VALIDATED,
                    validatedAt: { $gte: from, $lte: to },
                },
            },
            { $group: { _id: null, count: { $sum: 1 }, pointsTotal: { $sum: '$pointsRequiredSnapshot' } } },
        ]),
    ]);

    const consumptionByType = new Map(pointsResult.map((row) => [row._id, row.total]));
    const consumptionPoints = consumptionByType.get(PointsTransactionType.CONSUMPTION) ?? 0;
    const attendancePoints = consumptionByType.get(PointsTransactionType.ATTENDANCE) ?? 0;

    return {
        groupsCount: groupsResult[0]?.count ?? 0,
        consumptionTotalArs: consumptionResult[0]?.total ?? 0,
        pointsAwarded: {
            consumption: consumptionPoints,
            attendance: attendancePoints,
            total: consumptionPoints + attendancePoints,
        },
        redemptions: {
            count: redemptionsResult[0]?.count ?? 0,
            arsEquivalent: (redemptionsResult[0]?.pointsTotal ?? 0) * POINTS_TO_ARS_RATE,
        },
    };
}

interface ActivityAggregateRow {
    _id: Types.ObjectId;
    groupId: Types.ObjectId | null;
    groupName: string | null;
    checkedInAt: Date | null;
    consumptionArs: number;
    pointsAwarded: number;
    cashierId: Types.ObjectId | null;
    cashierName: string | null;
    outingStatus: OutingStatus;
    estado: ActivityRowStatus;
}

export async function getActivityTable(
    barId: string,
    range: DashboardRange,
    filters: DashboardFilters = {}
): Promise<ActivityRow[]> {
    const barObjectId = new Types.ObjectId(barId);
    const { from, to } = range;

    const pipeline: PipelineStage[] = [
        { $match: { bar: barObjectId, status: { $ne: OutingStatus.CANCELLED } } },
        { $addFields: { anchorDate: { $ifNull: ['$checkedInAt', '$scheduledFor'] } } },
        { $match: { anchorDate: { $gte: from, $lte: to } } },
    ];

    if (filters.cashierId) {
        pipeline.push({ $match: { checkedInBy: new Types.ObjectId(filters.cashierId) } });
    }

    pipeline.push(
        {
            $lookup: {
                from: Consumption.collection.name,
                let: { outingId: '$_id' },
                pipeline: [{ $match: { $expr: { $eq: ['$outing', '$$outingId'] } } }],
                as: 'consumptions',
            },
        },
        {
            $addFields: {
                hasDispute: {
                    $gt: [
                        {
                            $size: {
                                $filter: {
                                    input: '$consumptions',
                                    as: 'c',
                                    cond: { $eq: ['$$c.status', ConsumptionStatus.DISPUTED] },
                                },
                            },
                        },
                        0,
                    ],
                },
                consumptionArs: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: '$consumptions',
                                    as: 'c',
                                    cond: {
                                        $or: [
                                            { $eq: ['$$c.status', ConsumptionStatus.CONFIRMED] },
                                            {
                                                $and: [
                                                    { $eq: ['$$c.status', ConsumptionStatus.RESOLVED_BY_OWNER] },
                                                    { $eq: ['$$c.resolutionOutcome', 'ACCEPTED'] },
                                                ],
                                            },
                                        ],
                                    },
                                },
                            },
                            as: 'c',
                            in: '$$c.amount',
                        },
                    },
                },
            },
        },
        {
            $lookup: {
                from: PointsTransaction.collection.name,
                let: { outingId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$outing', '$$outingId'] },
                                    { $in: ['$type', [PointsTransactionType.CONSUMPTION, PointsTransactionType.ATTENDANCE]] },
                                ],
                            },
                        },
                    },
                ],
                as: 'pointsTx',
            },
        },
        { $addFields: { pointsAwarded: { $sum: '$pointsTx.amount' } } },
        { $lookup: { from: Group.collection.name, localField: 'group', foreignField: '_id', as: 'groupDoc' } },
        { $unwind: { path: '$groupDoc', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: User.collection.name, localField: 'checkedInBy', foreignField: '_id', as: 'cashierDoc' } },
        { $unwind: { path: '$cashierDoc', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                estado: {
                    $switch: {
                        branches: [
                            { case: '$hasDispute', then: 'disputa' },
                            { case: { $eq: ['$status', OutingStatus.ACTIVE] }, then: 'en_curso' },
                            { case: { $in: ['$status', [OutingStatus.COMPLETED, OutingStatus.NO_SHOW]] }, then: 'finalizada' },
                            { case: { $eq: ['$status', OutingStatus.PENDING] }, then: 'reservada' },
                        ],
                        default: 'reservada',
                    },
                },
            },
        }
    );

    if (filters.status) {
        pipeline.push({ $match: { estado: filters.status } });
    }

    pipeline.push(
        {
            $project: {
                _id: 1,
                groupId: '$group',
                groupName: { $ifNull: ['$groupDoc.name', ''] },
                checkedInAt: 1,
                consumptionArs: 1,
                pointsAwarded: 1,
                cashierId: '$checkedInBy',
                cashierName: {
                    $cond: [
                        '$cashierDoc',
                        { $trim: { input: { $concat: ['$cashierDoc.name', ' ', '$cashierDoc.lastName'] } } },
                        null,
                    ],
                },
                outingStatus: '$status',
                estado: 1,
            },
        },
        { $sort: { checkedInAt: -1 } }
    );

    const rows = await Outing.aggregate<ActivityAggregateRow>(pipeline);

    return rows.map((row) => ({
        outingId: row._id.toString(),
        groupId: row.groupId ? row.groupId.toString() : null,
        groupName: row.groupName ?? '',
        checkedInAt: row.checkedInAt ?? null,
        consumptionArs: row.consumptionArs ?? 0,
        pointsAwarded: row.pointsAwarded ?? 0,
        cashierId: row.cashierId ? row.cashierId.toString() : null,
        cashierName: row.cashierName ?? null,
        status: row.estado,
    }));
}

interface DisputeAggregateRow {
    _id: Types.ObjectId;
    outingId: Types.ObjectId;
    groupId: Types.ObjectId | null;
    groupName: string | null;
    amount: number;
    cashierId: Types.ObjectId | null;
    cashierName: string | null;
    createdAt: Date;
    rejectCount: number;
}

export async function getDisputesPanel(barId: string, range: DashboardRange): Promise<DisputeRow[]> {
    const barObjectId = new Types.ObjectId(barId);
    const { from, to } = range;

    const rows = await Consumption.aggregate<DisputeAggregateRow>([
        {
            $match: {
                bar: barObjectId,
                status: ConsumptionStatus.DISPUTED,
                createdAt: { $gte: from, $lte: to },
            },
        },
        { $lookup: { from: Outing.collection.name, localField: 'outing', foreignField: '_id', as: 'outingDoc' } },
        { $unwind: { path: '$outingDoc', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: Group.collection.name, localField: 'outingDoc.group', foreignField: '_id', as: 'groupDoc' } },
        { $unwind: { path: '$groupDoc', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: User.collection.name, localField: 'cashier', foreignField: '_id', as: 'cashierDoc' } },
        { $unwind: { path: '$cashierDoc', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                outingId: '$outing',
                groupId: '$outingDoc.group',
                groupName: { $ifNull: ['$groupDoc.name', ''] },
                amount: 1,
                cashierId: '$cashier',
                cashierName: {
                    $cond: [
                        '$cashierDoc',
                        { $trim: { input: { $concat: ['$cashierDoc.name', ' ', '$cashierDoc.lastName'] } } },
                        null,
                    ],
                },
                createdAt: 1,
                rejectCount: 1,
            },
        },
        { $sort: { createdAt: -1 } },
    ]);

    return rows.map((row) => ({
        consumptionId: row._id.toString(),
        outingId: row.outingId.toString(),
        groupId: row.groupId ? row.groupId.toString() : null,
        groupName: row.groupName ?? '',
        amount: row.amount,
        cashierId: row.cashierId ? row.cashierId.toString() : null,
        cashierName: row.cashierName ?? null,
        createdAt: row.createdAt,
        rejectCount: row.rejectCount ?? 0,
    }));
}

interface CashierMeta {
    id: string;
    name: string;
}

/**
 * Tabla de cajeros: por cada `BarUser{bar, role=CASHIER, isActive=true}` +
 * fila de totales. `filters.status` (estado derivado de la tabla de
 * actividad) no aplica acá — no hay una fila-por-salida a la que mapearlo,
 * solo `filters.cashierId` restringe a una única fila (decisión de
 * implementación, ver progress/implementers/impl_LB-74.md).
 */
export async function getCashierTable(
    barId: string,
    range: DashboardRange,
    filters: DashboardFilters = {}
): Promise<CashierTable> {
    const barObjectId = new Types.ObjectId(barId);
    const { from, to } = range;

    const cashierFilter: Record<string, unknown> = {
        bar: barObjectId,
        role: BarUserRole.CASHIER,
        isActive: true,
    };
    if (filters.cashierId) {
        cashierFilter.user = new Types.ObjectId(filters.cashierId);
    }

    const cashierMemberships = await BarUser.find(cashierFilter).select('user').lean();
    const cashierIds = cashierMemberships.map((m) => m.user);

    if (cashierIds.length === 0) {
        const emptyTotals = { checkIns: 0, consumptionArs: 0, pointsAwarded: 0, redemptionsCount: 0, redemptionsArs: 0, net: 0 };
        return { rows: [], totals: emptyTotals };
    }

    const [users, checkInsResult, consumptionResult, pointsResult, redemptionsResult] = await Promise.all([
        User.find({ _id: { $in: cashierIds } }).select('name lastName').lean(),
        Outing.aggregate<{ _id: Types.ObjectId; count: number }>([
            {
                $match: {
                    bar: barObjectId,
                    status: { $ne: OutingStatus.CANCELLED },
                    checkedInBy: { $in: cashierIds },
                },
            },
            { $addFields: { anchorDate: { $ifNull: ['$checkedInAt', '$scheduledFor'] } } },
            { $match: { anchorDate: { $gte: from, $lte: to } } },
            { $group: { _id: '$checkedInBy', count: { $sum: 1 } } },
        ]),
        Consumption.aggregate<{ _id: Types.ObjectId; total: number }>([
            {
                $match: {
                    bar: barObjectId,
                    cashier: { $in: cashierIds },
                    createdAt: { $gte: from, $lte: to },
                    ...validConsumptionStatusMatch(),
                },
            },
            { $group: { _id: '$cashier', total: { $sum: '$amount' } } },
        ]),
        PointsTransaction.aggregate<{ _id: Types.ObjectId; total: number }>([
            {
                $match: {
                    bar: barObjectId,
                    type: PointsTransactionType.CONSUMPTION,
                    createdAt: { $gte: from, $lte: to },
                },
            },
            {
                $lookup: {
                    from: Consumption.collection.name,
                    localField: 'consumption',
                    foreignField: '_id',
                    as: 'consumptionDoc',
                },
            },
            { $unwind: '$consumptionDoc' },
            { $match: { 'consumptionDoc.cashier': { $in: cashierIds } } },
            { $group: { _id: '$consumptionDoc.cashier', total: { $sum: '$amount' } } },
        ]),
        Redemption.aggregate<{ _id: Types.ObjectId; count: number; pointsTotal: number }>([
            {
                $match: {
                    bar: barObjectId,
                    cashier: { $in: cashierIds },
                    status: RedemptionStatus.VALIDATED,
                    validatedAt: { $gte: from, $lte: to },
                },
            },
            { $group: { _id: '$cashier', count: { $sum: 1 }, pointsTotal: { $sum: '$pointsRequiredSnapshot' } } },
        ]),
    ]);

    const userById = new Map<string, CashierMeta>(
        users.map((u) => [u._id.toString(), { id: u._id.toString(), name: `${u.name} ${u.lastName}`.trim() }])
    );
    const checkInsById = new Map(checkInsResult.map((r) => [r._id.toString(), r.count]));
    const consumptionById = new Map(consumptionResult.map((r) => [r._id.toString(), r.total]));
    const pointsById = new Map(pointsResult.map((r) => [r._id.toString(), r.total]));
    const redemptionsById = new Map(redemptionsResult.map((r) => [r._id.toString(), r]));

    const rows: CashierRow[] = cashierIds.map((cashierId) => {
        const id = cashierId.toString();
        const meta = userById.get(id);
        const consumptionArs = consumptionById.get(id) ?? 0;
        const redemption = redemptionsById.get(id);
        const redemptionsArs = (redemption?.pointsTotal ?? 0) * POINTS_TO_ARS_RATE;

        return {
            cashierId: id,
            cashierName: meta?.name ?? '',
            checkIns: checkInsById.get(id) ?? 0,
            consumptionArs,
            pointsAwarded: pointsById.get(id) ?? 0,
            redemptionsCount: redemption?.count ?? 0,
            redemptionsArs,
            net: consumptionArs - redemptionsArs,
        };
    });

    const totals = rows.reduce(
        (acc, row) => ({
            checkIns: acc.checkIns + row.checkIns,
            consumptionArs: acc.consumptionArs + row.consumptionArs,
            pointsAwarded: acc.pointsAwarded + row.pointsAwarded,
            redemptionsCount: acc.redemptionsCount + row.redemptionsCount,
            redemptionsArs: acc.redemptionsArs + row.redemptionsArs,
            net: acc.net + row.net,
        }),
        { checkIns: 0, consumptionArs: 0, pointsAwarded: 0, redemptionsCount: 0, redemptionsArs: 0, net: 0 }
    );

    return { rows, totals };
}
