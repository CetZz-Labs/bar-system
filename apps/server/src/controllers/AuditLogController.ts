import { Request, Response } from "express";
import { Types } from "mongoose";
import AuditLog from "../models/AuditLog";
import User from "../models/User";
import { resolveOwnerAccess } from "../utils/barAccess";
import { buildAuditLogCsv } from "../utils/auditLogExport";

/**
 * LB-77: lectura del log de auditoría (OWNER-only, inmutable). Mismo patrón
 * de auth que DashboardController/RewardController: `authenticate()`
 * normal + `resolveOwnerAccess` (403 a CASHIER).
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Campos string de `metadata` (Mixed) sobre los que se aplica la búsqueda
// por texto (`q`) — Mongo no tiene full-text nativo sobre Mixed, se usa
// `$regex` sobre campos string concretos (nota técnica del contrato §5).
const SEARCHABLE_METADATA_KEYS = [
    'consumptionId',
    'redemptionId',
    'outingId',
    'groupId',
    'rewardId',
    'shiftId',
    'name',
    'resolution',
    'closureReason',
    'endReason',
];

interface AuditLogCursor {
    createdAt: string;
    id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
    const payload: AuditLogCursor = { createdAt: createdAt.toISOString(), id };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): AuditLogCursor | null {
    try {
        const raw = Buffer.from(cursor, 'base64url').toString('utf8');
        const parsed = JSON.parse(raw) as Partial<AuditLogCursor>;
        if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
            return null;
        }
        return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
        return null;
    }
}

export class AuditLogController {
    /**
     * GET /api/bars/:barId/audit-logs
     * Query: from, to, eventType, actorType, actorId, entityId, q, cursor,
     * limit, format.
     */
    static getAuditLogs = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const {
            from,
            to,
            eventType,
            actorType,
            actorId,
            entityId,
            q,
            cursor,
            limit: rawLimit,
            format,
        } = req.query as Record<string, string | undefined>;

        const filter: Record<string, unknown> = { bar: new Types.ObjectId(barId) };

        const createdAt: Record<string, Date> = {};
        if (from) createdAt.$gte = new Date(from);
        if (to) createdAt.$lte = new Date(to);
        if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

        if (eventType) filter.eventType = eventType;
        if (actorType) filter.actorType = actorType;
        if (actorId) filter.actorId = new Types.ObjectId(actorId);
        if (entityId) filter.entityId = new Types.ObjectId(entityId);

        if (q) {
            const regex = new RegExp(q, 'i');
            filter.$or = [
                { actorName: regex },
                ...SEARCHABLE_METADATA_KEYS.map((key) => ({ [`metadata.${key}`]: regex })),
            ];
        }

        if (cursor) {
            const decoded = decodeCursor(cursor);
            if (!decoded) {
                res.status(400).json({ message: 'Cursor inválido' });
                return;
            }
            filter.$and = [
                {
                    $or: [
                        { createdAt: { $lt: new Date(decoded.createdAt) } },
                        {
                            createdAt: new Date(decoded.createdAt),
                            _id: { $lt: new Types.ObjectId(decoded.id) },
                        },
                    ],
                },
            ];
        }

        const parsedLimit = Number(rawLimit ?? DEFAULT_LIMIT);
        const limit = Number.isNaN(parsedLimit)
            ? DEFAULT_LIMIT
            : Math.min(Math.max(parsedLimit, 1), MAX_LIMIT);

        const rows = await AuditLog.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit)
            .lean();

        // Batch resolve actorId → name: single query for all unique actorIds
        // that lack a snapshot actorName, ensuring every row always has a name.
        const actorIdsToResolve = [
            ...new Set(
                rows
                    .filter((row) => row.actorId && !row.actorName)
                    .map((row) => row.actorId!.toString())
            ),
        ];

        let userNamesMap: Record<string, string> = {};
        if (actorIdsToResolve.length > 0) {
            const users = await User.find({
                _id: { $in: actorIdsToResolve.map((id) => new Types.ObjectId(id)) },
            })
                .select("name")
                .lean();
            for (const user of users) {
                userNamesMap[user._id.toString()] = user.name;
            }
        }

        const items = rows.map((row) => {
            const resolvedName =
                row.actorName ?? (row.actorId ? userNamesMap[row.actorId.toString()] : undefined);
            return {
                id: row._id.toString(),
                bar: row.bar.toString(),
                actorType: row.actorType,
                actorId: row.actorId ? row.actorId.toString() : null,
                actorName: resolvedName ?? null,
                eventType: row.eventType,
                entityType: row.entityType ?? null,
                entityId: row.entityId ? row.entityId.toString() : null,
                metadata: row.metadata ?? null,
                deviceInfo: row.deviceInfo ?? null,
                ip: row.ip ?? null,
                createdAt: row.createdAt,
            };
        });

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
            res.status(200).send(buildAuditLogCsv(items));
            return;
        }

        const hasMore = rows.length === limit;
        const nextCursor =
            hasMore && rows.length > 0
                ? encodeCursor(rows[rows.length - 1].createdAt, rows[rows.length - 1]._id.toString())
                : null;

        res.status(200).json({ items, nextCursor, hasMore });
    };
}
