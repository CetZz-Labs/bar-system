import Shift, { IShift, IShiftSummary, ShiftSummaryStatus } from '../models/Shift';
import Consumption, { ConsumptionStatus, IConsumption } from '../models/Consumption';
import PointsTransaction from '../models/PointsTransaction';

export class ShiftSummaryError extends Error {
    readonly code: 'SHIFT_NOT_CLOSED';

    constructor() {
        super('The shift must be closed before generating a summary');
        this.name = 'ShiftSummaryError';
        this.code = 'SHIFT_NOT_CLOSED';
    }
}

type SummaryConsumption = Pick<IConsumption, 'outing' | 'amount' | 'status'>;

function isConsumptionStatus(value: SummaryConsumption['status'], status: ConsumptionStatus): boolean {
    return value === status;
}

async function loadShiftConsumptions(shift: IShift): Promise<SummaryConsumption[]> {
    if (!shift.endedAt) {
        throw new ShiftSummaryError();
    }

    return Consumption.find({
        cashier: shift.user,
        bar: shift.bar,
        createdAt: {
            $gte: shift.startedAt,
            $lte: shift.endedAt,
        },
        $or: [
            { shift: shift._id },
            { shift: { $exists: false } },
        ],
    })
        .select('outing amount status')
        .lean();
}

async function calculatePoints(outingIds: string[]): Promise<number> {
    if (outingIds.length === 0) return 0;

    const transactions = await PointsTransaction.find({ outing: { $in: outingIds } })
        .select('amount')
        .lean();

    return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

export function buildShiftSummary(
    consumptions: SummaryConsumption[],
    pointsAwarded: number,
    generatedAt: Date,
): IShiftSummary {
    const confirmedConsumptions = consumptions.filter((consumption) =>
        isConsumptionStatus(consumption.status, ConsumptionStatus.CONFIRMED)
    ).length;
    const pendingConsumptions = consumptions.filter((consumption) =>
        isConsumptionStatus(consumption.status, ConsumptionStatus.PENDING_LEADER_CONFIRMATION)
    ).length;
    const rejectedConsumptions = consumptions.filter((consumption) =>
        isConsumptionStatus(consumption.status, ConsumptionStatus.REJECTED)
    ).length;
    const disputedConsumptions = consumptions.filter((consumption) =>
        isConsumptionStatus(consumption.status, ConsumptionStatus.DISPUTED)
    ).length;
    const totalAmount = consumptions
        .filter((consumption) => isConsumptionStatus(consumption.status, ConsumptionStatus.CONFIRMED))
        .reduce((total, consumption) => total + consumption.amount, 0);

    return {
        status: ShiftSummaryStatus.PENDING,
        totalConsumptions: consumptions.length,
        confirmedConsumptions,
        pendingConsumptions,
        rejectedConsumptions,
        disputedConsumptions,
        totalAmount,
        pointsAwarded,
        // No redemption model exists in the current backend. Keep the field in
        // the persisted contract so clients can distinguish zero from unknown.
        redemptionCount: 0,
        redemptionsAvailable: false,
        generatedAt,
    };
}

/**
 * Generates and persists a shift summary exactly once.
 *
 * The conditional findOneAndUpdate is the idempotency boundary: concurrent
 * callers may calculate the same values, but only the first one can persist a
 * summary for a shift. Existing consumptions without the new `shift` reference
 * are included through the legacy fallback query bounded by the shift's
 * cashier, bar and start/end timestamps.
 */
export async function generateShiftSummary(shiftId: string): Promise<IShiftSummary> {
    const shift = await Shift.findById(shiftId);
    if (!shift) {
        throw new Error('Shift not found');
    }
    if (!shift.endedAt) {
        throw new ShiftSummaryError();
    }
    if (shift.summary) {
        return shift.summary;
    }

    const consumptions = await loadShiftConsumptions(shift);
    const outingIds = [...new Set(
        consumptions
            .filter((consumption) => consumption.status === ConsumptionStatus.CONFIRMED)
            .map((consumption) => consumption.outing.toString())
    )];
    const pointsAwarded = await calculatePoints(outingIds);
    const summary = buildShiftSummary(consumptions, pointsAwarded, new Date());

    const persistedShift = await Shift.findOneAndUpdate(
        { _id: shift._id, summary: { $exists: false } },
        { $set: { summary } },
        { new: true },
    );

    if (persistedShift?.summary) {
        return persistedShift.summary;
    }

    const existingShift = await Shift.findById(shiftId).select('summary').lean();
    if (existingShift?.summary) {
        return existingShift.summary;
    }

    throw new Error('Unable to persist shift summary');
}
