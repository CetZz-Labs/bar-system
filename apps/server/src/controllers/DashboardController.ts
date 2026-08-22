import { Request, Response } from "express";
import mongoose from "mongoose";
import Bar from "../models/Bar";
import Consumption, { ConsumptionStatus, ConsumptionResolutionOutcome } from "../models/Consumption";
import Outing from "../models/Outing";
import Group from "../models/Group";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import AuditLog, { AuditAction } from "../models/AuditLog";
import { resolveOwnerAccess } from "../utils/barAccess";
import { pointsFromAmount } from "../utils/consumptionPoints";
import { emitGroupPointsBalance } from "../websocket/pointsHub";
import {
    ActivityRowStatus,
    DashboardFilters,
    DashboardPeriodType,
    exceedsMaxRange,
    getActivityTable,
    getCashierTable,
    getDashboardStatCards,
    getDisputesPanel,
    resolveDashboardPeriod,
} from "../utils/barDashboard";

// LB-74: dashboard del bar (OWNER). Auth: `authenticate()` normal (no
// `authenticateCashier` — es el dueño, no el cajero) + `resolveOwnerAccess`
// (utils/barAccess.ts, extraída de RewardController.ts para este ticket).

export class DashboardController {
    /**
     * GET /api/bars/:barId/dashboard
     * Query: period=today|week|month|custom, from, to, cashierId, status.
     */
    static getDashboard = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const bar = await Bar.findById(barId).select('closingTime').lean();
        if (!bar) {
            res.status(404).json({ message: 'Bar no encontrado' });
            return;
        }

        const period = (req.query.period as DashboardPeriodType | undefined) ?? 'today';
        const cashierId = req.query.cashierId as string | undefined;
        const status = req.query.status as ActivityRowStatus | undefined;

        const range = resolveDashboardPeriod(
            period,
            req.query.from as string | undefined,
            req.query.to as string | undefined,
            bar.closingTime
        );

        if (
            Number.isNaN(range.from.getTime()) ||
            Number.isNaN(range.to.getTime()) ||
            range.to.getTime() < range.from.getTime()
        ) {
            res.status(400).json({ message: 'Rango de fechas inválido' });
            return;
        }

        if (exceedsMaxRange(range.from, range.to)) {
            res.status(400).json({ message: 'El rango máximo permitido es de 3 meses' });
            return;
        }

        const filters: DashboardFilters = { cashierId, status };

        const [statCards, activity, disputes, cashiers] = await Promise.all([
            getDashboardStatCards(barId, range),
            getActivityTable(barId, range, filters),
            getDisputesPanel(barId, range),
            getCashierTable(barId, range, filters),
        ]);

        res.status(200).json({
            period: { type: period, from: range.from, to: range.to },
            statCards,
            activity,
            disputes,
            cashiers,
        });
    };

    /**
     * PATCH /api/bars/:barId/consumptions/:consumptionId/resolve
     * Body: { outcome: 'ACCEPTED'|'REJECTED', note: string }
     *
     * Válido solo si consumption.status === DISPUTED y consumption.bar ===
     * barId (scoping resuelto con `findOne({_id, bar})`, mismo criterio que
     * RewardController.updateReward/deleteReward: 404 genérico, tanto para
     * "no existe" como para "es de otro bar").
     */
    static resolveConsumptionDispute = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const consumptionId = req.params.consumptionId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const { outcome, note } = req.body as { outcome: ConsumptionResolutionOutcome; note: string };

        const consumption = await Consumption.findOne({ _id: consumptionId, bar: barId });
        if (!consumption) {
            res.status(404).json({ message: 'Consumo no encontrado' });
            return;
        }

        if (consumption.status !== ConsumptionStatus.DISPUTED) {
            res.status(409).json({ message: 'Este consumo no está en disputa' });
            return;
        }

        const outing = await Outing.findById(consumption.outing);
        if (!outing) {
            res.status(404).json({ message: 'Salida no encontrada' });
            return;
        }

        let pointsAwarded = consumption.pointsAwarded ?? 0;

        if (outcome === 'ACCEPTED') {
            const session = await mongoose.startSession();

            try {
                session.startTransaction();

                const fresh = await Consumption.findById(consumptionId).session(session);
                if (!fresh || fresh.status !== ConsumptionStatus.DISPUTED) {
                    await session.abortTransaction();
                    res.status(409).json({ message: 'Este consumo ya fue procesado' });
                    return;
                }

                fresh.status = ConsumptionStatus.RESOLVED_BY_OWNER;
                fresh.resolutionOutcome = 'ACCEPTED';
                fresh.resolutionNote = note;
                fresh.resolvedBy = req.user!._id;
                fresh.resolvedAt = new Date();

                // Mismo mecanismo que LeaderConsumptionController.accept:
                // solo otorga puntos si todavía no se generaron para este
                // consumo (defensa en profundidad, un DISPUTED nunca debería
                // tener pointsAwarded seteado, pero no se asume).
                if (fresh.pointsAwarded === undefined || fresh.pointsAwarded === null) {
                    const points = pointsFromAmount(fresh.amount);
                    fresh.pointsAwarded = points;
                    pointsAwarded = points;
                    await fresh.save({ session });

                    if (points > 0) {
                        await Group.findByIdAndUpdate(
                            outing.group,
                            { $inc: { pointsBalance: points } },
                            { session }
                        );

                        await PointsTransaction.create(
                            [
                                {
                                    group: outing.group,
                                    outing: outing._id,
                                    bar: consumption.bar,
                                    type: PointsTransactionType.CONSUMPTION,
                                    amount: points,
                                    label: `Consumo $${fresh.amount} (resuelto por el dueño)`,
                                    consumption: fresh._id,
                                },
                            ],
                            { session }
                        );
                    }
                } else {
                    pointsAwarded = fresh.pointsAwarded;
                    await fresh.save({ session });
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

            const groupAfter = await Group.findById(outing.group).select('pointsBalance').lean();
            emitGroupPointsBalance(outing.group.toString(), groupAfter?.pointsBalance ?? 0);
        } else {
            consumption.status = ConsumptionStatus.RESOLVED_BY_OWNER;
            consumption.resolutionOutcome = 'REJECTED';
            consumption.resolutionNote = note;
            consumption.resolvedBy = req.user!._id;
            consumption.resolvedAt = new Date();
            await consumption.save();
        }

        await AuditLog.create({
            bar: consumption.bar,
            user: req.user!._id,
            action: AuditAction.CONSUMPTION_RESOLVED_BY_OWNER,
            amount: consumption.amount,
            outing: outing._id,
            group: outing.group,
            ip: req.ip,
        });

        res.status(200).json({
            consumptionId: consumption._id.toString(),
            status: ConsumptionStatus.RESOLVED_BY_OWNER,
            resolutionOutcome: outcome,
            pointsAwarded,
        });
    };
}
