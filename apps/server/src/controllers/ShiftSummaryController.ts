import { Request, Response } from 'express';
import Shift, { IShift, IShiftSummary, ShiftEndReason, ShiftSummaryStatus } from '../models/Shift';
import BarUser, { BarUserRole } from '../models/BarUser';
import { generateShiftSummary } from '../utils/shiftSummary';
import { buildCsv, buildPdf, ShiftSummaryExportData } from '../utils/shiftSummaryExport';

type ShiftSummaryResponse = ShiftSummaryExportData;

function mapSummary(shift: IShift, summary: IShiftSummary): ShiftSummaryResponse {
    return {
        shiftId: shift._id,
        barId: shift.bar,
        cashierId: shift.user,
        role: shift.role,
        deviceInfo: shift.deviceInfo,
        startedAt: shift.startedAt,
        endedAt: shift.endedAt,
        endReason: shift.endReason,
        summary,
    };
}

async function findAccessibleShift(
    req: Request,
    shiftId: string,
): Promise<{ shift?: IShift; forbidden: boolean }> {
    const shift = await Shift.findById(shiftId);
    if (!shift) return { forbidden: false };

    const cashierContext = req.cashierSummaryContext;
    const userId = cashierContext?.user._id.toString() ?? req.user?._id.toString();
    if (!userId) return { forbidden: true };

    const barUser = await BarUser.findOne({ bar: shift.bar, user: userId });
    if (!barUser || !barUser.isActive) {
        return { forbidden: true };
    }

    if (cashierContext && shift.bar.toString() !== cashierContext.bar.toString()) {
        return { forbidden: true };
    }

    const isOwner = barUser.role === BarUserRole.OWNER;
    const isOwnCashierShift = barUser.role === BarUserRole.CASHIER
        && cashierContext !== undefined
        && shift.user.toString() === userId
        && shift.bar.toString() === cashierContext.bar.toString();

    if (!isOwner && !isOwnCashierShift) {
        return { forbidden: true };
    }

    return { shift, forbidden: false };
}

async function getSummary(shift: IShift): Promise<IShiftSummary> {
    return shift.summary ?? generateShiftSummary(shift._id.toString());
}

function sendOwnershipError(res: Response, forbidden: boolean): void {
    if (forbidden) {
        res.status(403).json({ message: 'You are not authorized to access this shift summary' });
        return;
    }
    res.status(404).json({ message: 'Shift not found' });
}

export class ShiftSummaryController {
    static getSummary = async (req: Request, res: Response) => {
        const result = await findAccessibleShift(req, req.params.shiftId as string);
        if (!result.shift) {
            sendOwnershipError(res, result.forbidden);
            return;
        }

        const summary = await getSummary(result.shift);
        res.status(200).json(mapSummary(result.shift, summary));
    };

    static downloadCsv = async (req: Request, res: Response) => {
        const result = await findAccessibleShift(req, req.params.shiftId as string);
        if (!result.shift) {
            sendOwnershipError(res, result.forbidden);
            return;
        }

        const summary = await getSummary(result.shift);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="shift-${result.shift._id.toString()}.csv"`,
        );
        res.send(buildCsv(mapSummary(result.shift, summary)));
    };

    static downloadPdf = async (req: Request, res: Response) => {
        const result = await findAccessibleShift(req, req.params.shiftId as string);
        if (!result.shift) {
            sendOwnershipError(res, result.forbidden);
            return;
        }

        const summary = await getSummary(result.shift);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="shift-${result.shift._id.toString()}.pdf"`,
        );
        res.send(buildPdf(mapSummary(result.shift, summary)));
    };

    static pendingSummary = async (req: Request, res: Response) => {
        const cashierContext = req.cashierSummaryContext;
        if (!cashierContext) {
            res.status(403).json({ message: 'Only a cashier session can access pending cashier summaries' });
            return;
        }

        const shift = await Shift.findOne({
            bar: cashierContext.bar,
            user: cashierContext.user._id,
            endedAt: { $ne: null },
            endReason: ShiftEndReason.BAR_CLOSED,
            'summary.status': ShiftSummaryStatus.PENDING,
        }).sort({ endedAt: -1 });

        if (!shift) {
            res.status(404).json({
                code: 'NO_PENDING_AUTO_CLOSED_SHIFT_SUMMARY',
                message: 'No pending automatically closed shift summary was found',
            });
            return;
        }

        const summary = await getSummary(shift);
        res.status(200).json(mapSummary(shift, summary));
    };

    static history = async (req: Request, res: Response) => {
        const barId = String(req.query.barId);
        const barUser = await BarUser.findOne({ bar: barId, user: req.user!._id });
        if (!barUser || barUser.role !== BarUserRole.OWNER || !barUser.isActive) {
            res.status(403).json({ message: 'Only the bar owner can access shift history' });
            return;
        }

        const filter: {
            bar: string;
            endedAt: { $ne: null };
            startedAt?: { $gte?: Date; $lte?: Date };
        } = {
            bar: barId,
            endedAt: { $ne: null },
        };
        const startedAt: { $gte?: Date; $lte?: Date } = {};
        if (req.query.from) startedAt.$gte = new Date(String(req.query.from));
        if (req.query.to) startedAt.$lte = new Date(String(req.query.to));
        if (Object.keys(startedAt).length > 0) filter.startedAt = startedAt;

        const shifts = await Shift.find(filter).sort({ startedAt: -1 }).lean();
        const history = await Promise.all(shifts.map(async (shift) => ({
            ...mapSummary(shift as IShift, shift.summary ?? await generateShiftSummary(shift._id.toString())),
        })));

        res.status(200).json(history);
    };
}
