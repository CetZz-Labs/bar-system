import { Request, Response } from "express";
import { Types } from "mongoose";
import Group from "../models/Group";
import Bar from "../models/Bar";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import Consumption from "../models/Consumption";
import User from "../models/User";

export class GroupBalanceController {
    /**
     * GET /api/groups/:groupId/balance
     * LB-70 — saldo global + desglose por bar (solo > 0).
     */
    static getBalance = async (req: Request, res: Response) => {
        try {
            const groupId = req.params.groupId as string;
            const userId = req.user!._id.toString();

            const group = await Group.findById(groupId).select("pointsBalance memberships").lean();
            if (!group) {
                res.status(404).json({ message: "Grupo no encontrado" });
                return;
            }

            const isMember = group.memberships.some((m) => m.user.toString() === userId);
            if (!isMember) {
                res.status(403).json({ message: "No tenés acceso a este grupo" });
                return;
            }

            const aggregated = await PointsTransaction.aggregate<{
                _id: Types.ObjectId;
                points: number;
                lastActivityAt: Date;
            }>([
                { $match: { group: new Types.ObjectId(groupId) } },
                {
                    $group: {
                        _id: "$bar",
                        points: { $sum: "$amount" },
                        lastActivityAt: { $max: "$createdAt" },
                    },
                },
                { $match: { points: { $gt: 0 } } },
                { $sort: { points: -1 } },
            ]);

            const barIds = aggregated.map((row) => row._id);
            const bars = await Bar.find({ _id: { $in: barIds } }).select("name").lean();
            const barNameById = new Map(bars.map((b) => [b._id.toString(), b.name]));

            const byBar = aggregated.map((row) => ({
                barId: row._id.toString(),
                barName: barNameById.get(row._id.toString()) ?? "Bar",
                points: row.points,
                lastActivityAt: row.lastActivityAt.toISOString(),
            }));

            const updatedAt =
                byBar.length > 0
                    ? byBar.reduce(
                          (latest, row) => (row.lastActivityAt > latest ? row.lastActivityAt : latest),
                          byBar[0].lastActivityAt
                      )
                    : null;

            res.status(200).json({
                total: group.pointsBalance ?? 0,
                byBar,
                updatedAt,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al obtener el saldo" });
        }
    };

    /**
     * GET /api/groups/:groupId/history?cursor=&limit=20
     * LB-71 — historial paginado por cursor (`createdAt|_id`).
     */
    static getHistory = async (req: Request, res: Response) => {
        try {
            const groupId = req.params.groupId as string;
            const userId = req.user!._id.toString();
            const limitRaw = Number(req.query.limit ?? 20);
            const limit = Number.isFinite(limitRaw)
                ? Math.min(Math.max(Math.floor(limitRaw), 1), 50)
                : 20;
            const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

            const group = await Group.findById(groupId).select("memberships").lean();
            if (!group) {
                res.status(404).json({ message: "Grupo no encontrado" });
                return;
            }
            const isMember = group.memberships.some((m) => m.user.toString() === userId);
            if (!isMember) {
                res.status(403).json({ message: "No tenés acceso a este grupo" });
                return;
            }

            const txFilter: Record<string, unknown> = {
                group: new Types.ObjectId(groupId),
            };

            if (cursor) {
                const [iso, id] = cursor.split("|");
                if (!iso || !id || !Types.ObjectId.isValid(id)) {
                    res.status(400).json({ message: "cursor inválido" });
                    return;
                }
                const createdAt = new Date(iso);
                if (Number.isNaN(createdAt.getTime())) {
                    res.status(400).json({ message: "cursor inválido" });
                    return;
                }
                txFilter.$or = [
                    { createdAt: { $lt: createdAt } },
                    { createdAt, _id: { $lt: new Types.ObjectId(id) } },
                ];
            }

            const transactions = await PointsTransaction.find(txFilter)
                .sort({ createdAt: -1, _id: -1 })
                .limit(limit + 1)
                .lean();

            const hasMore = transactions.length > limit;
            const page = transactions.slice(0, limit);

            const barIds = [...new Set(page.map((t) => t.bar.toString()))];
            const bars = await Bar.find({ _id: { $in: barIds } }).select("name").lean();
            const barNameById = new Map(bars.map((b) => [b._id.toString(), b.name]));

            const consumptionIds = page
                .filter((t) => t.type === PointsTransactionType.CONSUMPTION && t.consumption)
                .map((t) => t.consumption!);
            const consumptions = await Consumption.find({ _id: { $in: consumptionIds } })
                .select("amount cashier")
                .lean();
            const cashiers = await User.find({
                _id: { $in: consumptions.map((c) => c.cashier) },
            })
                .select("name lastName")
                .lean();
            const cashierNameById = new Map(
                cashiers.map((u) => [
                    u._id.toString(),
                    `${u.name}${u.lastName ? ` ${u.lastName}` : ""}`.trim(),
                ])
            );
            const consumptionById = new Map(
                consumptions.map((c) => [c._id.toString(), c])
            );

            const items = page.map((t) => {
                const barId = t.bar.toString();
                if (t.type === PointsTransactionType.CONSUMPTION) {
                    const c = t.consumption
                        ? consumptionById.get(t.consumption.toString())
                        : undefined;
                    return {
                        id: t._id.toString(),
                        groupId,
                        barId,
                        barName: barNameById.get(barId) ?? "Bar",
                        type: "consumo" as const,
                        points: t.amount,
                        createdAt: t.createdAt.toISOString(),
                        metadata: {
                            amount: c?.amount,
                            cashierName: c
                                ? cashierNameById.get(c.cashier.toString())
                                : undefined,
                        },
                    };
                }
                return {
                    id: t._id.toString(),
                    groupId,
                    barId,
                    barName: barNameById.get(barId) ?? "Bar",
                    type: "asistencia" as const,
                    points: t.amount,
                    createdAt: t.createdAt.toISOString(),
                    metadata: { label: t.label },
                };
            });

            const last = items[items.length - 1];
            res.status(200).json({
                items,
                nextCursor: hasMore && last ? `${last.createdAt}|${last.id}` : null,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al obtener el historial" });
        }
    };
}
