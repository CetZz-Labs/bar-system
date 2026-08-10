import Group from '../models/Group';
import Outing, { OutingStatus } from '../models/Outing';
import Bar from '../models/Bar';
import { getBarDayRange } from './barDay';
import { Types } from 'mongoose';

const SEARCHABLE_STATUSES = [OutingStatus.ACTIVE, OutingStatus.IN_PROGRESS];

export type CashierSearchResult = {
    outingId: string;
    groupId: string;
    name: string;
    inviteCode: string;
    scheduledFor: string;
    status: OutingStatus;
    members: Array<{ id: string; name: string; lastName: string }>;
    action: 'check_in' | 'detail';
};

export type CashierSearchExactError =
    | { code: 'NO_SALIDA'; message: string }
    | { code: 'OTHER_BAR'; message: string; otherBarName: string };

export function extractInviteCodeFromQuery(raw: string): string | null {
    const trimmed = raw.trim();
    const fromUrl = trimmed.match(/\/unirse\/([A-Za-z0-9]{6})\b/i);
    if (fromUrl) {
        return fromUrl[1].toUpperCase();
    }
    if (/^[A-Za-z0-9]{6}$/.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    return null;
}

export function isDirectCodeQuery(raw: string): boolean {
    return extractInviteCodeFromQuery(raw) !== null;
}

async function mapOutingToResult(outing: {
    _id: Types.ObjectId;
    status: OutingStatus;
    scheduledFor: Date;
    group: {
        _id: Types.ObjectId;
        name: string;
        inviteCode: string;
    };
    invitedMembers: Array<{
        user?: { _id: Types.ObjectId; name: string; lastName: string } | Types.ObjectId;
    }>;
}): Promise<CashierSearchResult> {
    const members = outing.invitedMembers
        .map((m) => m.user)
        .filter((u): u is { _id: Types.ObjectId; name: string; lastName: string } =>
            !!u && typeof u === 'object' && 'name' in u
        )
        .map((u) => ({
            id: u._id.toString(),
            name: u.name,
            lastName: u.lastName,
        }));

    return {
        outingId: outing._id.toString(),
        groupId: outing.group._id.toString(),
        name: outing.group.name,
        inviteCode: outing.group.inviteCode,
        scheduledFor: outing.scheduledFor.toISOString(),
        status: outing.status,
        members,
        action: outing.status === OutingStatus.IN_PROGRESS ? 'detail' : 'check_in',
    };
}

/**
 * Búsqueda cajero (LB-54).
 * - Texto (≥2): solo grupos con salida ACTIVE/IN_PROGRESS hacia ESTE bar en el día del bar.
 * - Código/QR (6 chars): match directo; mensajes NO_SALIDA / OTHER_BAR si no aplica.
 * Sin logs de búsqueda (privacidad MVP).
 */
export async function searchGroupsForCashier(
    barId: string,
    closingHour: string,
    rawQuery: string
): Promise<{ results: CashierSearchResult[] } | CashierSearchExactError> {
    const q = rawQuery.trim();
    const { start, end } = getBarDayRange(new Date(), closingHour);
    const directCode = extractInviteCodeFromQuery(q);

    if (directCode) {
        const group = await Group.findOne({ inviteCode: directCode })
            .select('_id name inviteCode')
            .lean();

        if (!group) {
            return { results: [] };
        }

        const outingHere = await Outing.findOne({
            group: group._id,
            bar: barId,
            status: { $in: SEARCHABLE_STATUSES },
            scheduledFor: { $gte: start, $lt: end },
        })
            .populate('group', 'name inviteCode')
            .populate('invitedMembers.user', 'name lastName')
            .lean();

        if (outingHere && outingHere.group && typeof outingHere.group === 'object' && 'name' in outingHere.group) {
            return {
                results: [
                    await mapOutingToResult(
                        outingHere as unknown as Parameters<typeof mapOutingToResult>[0]
                    ),
                ],
            };
        }

        const outingElsewhere = await Outing.findOne({
            group: group._id,
            bar: { $ne: barId },
            status: { $in: SEARCHABLE_STATUSES },
            scheduledFor: { $gte: start, $lt: end },
        })
            .populate('bar', 'name')
            .lean();

        if (outingElsewhere) {
            const otherBar =
                outingElsewhere.bar &&
                typeof outingElsewhere.bar === 'object' &&
                'name' in outingElsewhere.bar
                    ? (outingElsewhere.bar as { name: string }).name
                    : 'otro bar';
            return {
                code: 'OTHER_BAR',
                otherBarName: otherBar,
                message: `Este grupo tiene salida a ${otherBar}, no a este. Debe cancelar esa salida y crear una nueva a este bar.`,
            };
        }

        return {
            code: 'NO_SALIDA',
            message:
                'Este grupo no tiene salida agendada a este bar. Pedíle al líder que cree una desde su app; después vuelve a buscar.',
        };
    }

    if (q.length < 2) {
        return { results: [] };
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const groups = await Group.find({
        name: { $regex: escaped, $options: 'i' },
    })
        .select('_id')
        .limit(40)
        .lean();

    if (groups.length === 0) {
        return { results: [] };
    }

    const groupIds = groups.map((g) => g._id);
    const outings = await Outing.find({
        group: { $in: groupIds },
        bar: barId,
        status: { $in: SEARCHABLE_STATUSES },
        scheduledFor: { $gte: start, $lt: end },
    })
        .populate('group', 'name inviteCode')
        .populate('invitedMembers.user', 'name lastName')
        .sort({ scheduledFor: 1 })
        .lean();

    const results: CashierSearchResult[] = [];
    for (const outing of outings) {
        if (outing.group && typeof outing.group === 'object' && 'name' in outing.group) {
            results.push(
                await mapOutingToResult(outing as unknown as Parameters<typeof mapOutingToResult>[0])
            );
        }
    }

    return { results };
}

/** Helper para mensajes / tests */
export async function getBarName(barId: string): Promise<string | null> {
    const bar = await Bar.findById(barId).select('name').lean();
    return bar?.name ?? null;
}
