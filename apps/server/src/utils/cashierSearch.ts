import Group from '../models/Group';
import Outing, { OutingStatus } from '../models/Outing';
import Bar from '../models/Bar';
import { getBarDayRange } from './barDay';
import { Types } from 'mongoose';

/**
 * Criterio de listado cajero:
 * - ACTIVE (en curso): siempre visible en este bar hasta que se cierre la salida
 *   (si no, al cruzar el cierre del bar desaparecen y no se pueden cargar consumos).
 * - PENDING: del día del bar actual o vencidas (`scheduledFor < end`), para no
 *   ocultar reservas abiertas que siguen bloqueando al grupo. Excluye PENDING
 *   futuras de días siguientes.
 */
function searchableOutingFilter(_start: Date, end: Date) {
    return {
        $or: [
            { status: OutingStatus.ACTIVE },
            {
                status: OutingStatus.PENDING,
                scheduledFor: { $lt: end },
            },
        ],
    };
}

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

type PopulatedOuting = {
    _id: Types.ObjectId;
    status: OutingStatus;
    scheduledFor: Date;
    group: {
        _id: Types.ObjectId;
        name: string;
        inviteCode: string;
    };
    invitees: Array<{ _id: Types.ObjectId; name: string; lastName: string } | Types.ObjectId>;
};

function mapOutingToResult(outing: PopulatedOuting): CashierSearchResult {
    const members = outing.invitees
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
        // PENDING = aún sin check-in; ACTIVE = ya en curso
        action: outing.status === OutingStatus.ACTIVE ? 'detail' : 'check_in',
    };
}

/**
 * Trae las salidas PENDING/ACTIVE de ESTE bar (día del bar + ACTIVE/PENDING vencidas),
 * opcionalmente acotadas a un set de grupos (búsqueda por nombre).
 * Sin `groupIds`: listado por defecto (LB-54).
 */
async function fetchOutingsForBar(
    barId: string,
    start: Date,
    end: Date,
    groupIds?: Types.ObjectId[]
): Promise<CashierSearchResult[]> {
    const outings = await Outing.find({
        ...(groupIds ? { group: { $in: groupIds } } : {}),
        bar: barId,
        ...searchableOutingFilter(start, end),
    })
        .populate('group', 'name inviteCode')
        .populate('invitees', 'name lastName')
        .sort({ scheduledFor: 1 })
        .lean();

    const results: CashierSearchResult[] = [];
    for (const outing of outings) {
        if (outing.group && typeof outing.group === 'object' && 'name' in outing.group) {
            results.push(mapOutingToResult(outing as unknown as PopulatedOuting));
        }
    }
    return results;
}

/**
 * Búsqueda cajero (LB-54).
 * - Sin texto: todas las salidas PENDING/ACTIVE hacia ESTE bar en el día del bar (listado por defecto).
 * - Texto (≥2): solo grupos con salida PENDING/ACTIVE hacia ESTE bar en el día del bar, filtrados por nombre.
 * - Código/QR (6 chars): match directo; mensajes NO_SALIDA / OTHER_BAR si no aplica.
 * Sin logs de búsqueda (privacidad MVP).
 */
export async function searchGroupsForCashier(
    barId: string,
    closingTime: string,
    rawQuery: string
): Promise<{ results: CashierSearchResult[] } | CashierSearchExactError> {
    const q = rawQuery.trim();
    const { start, end } = getBarDayRange(new Date(), closingTime || '06:00');
    const directCode = extractInviteCodeFromQuery(q);

    if (directCode) {
        const group = await Group.findOne({ inviteCode: directCode })
            .select('_id name inviteCode')
            .lean();

        if (group) {
            const outingHere = await Outing.findOne({
                group: group._id,
                bar: barId,
                ...searchableOutingFilter(start, end),
            })
                .populate('group', 'name inviteCode')
                .populate('invitees', 'name lastName')
                .lean();

            if (outingHere && outingHere.group && typeof outingHere.group === 'object' && 'name' in outingHere.group) {
                return {
                    results: [mapOutingToResult(outingHere as unknown as PopulatedOuting)],
                };
            }

            const outingElsewhere = await Outing.findOne({
                group: group._id,
                bar: { $ne: barId },
                ...searchableOutingFilter(start, end),
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

        // "Prueba"/"Manzan" matchean el patrón de código (6 alfanum) pero no son
        // invite codes reales → caer a búsqueda por nombre. Los QR/URLs /unirse/
        // sin grupo sí terminan vacíos.
        const isJoinUrl = /\/unirse\/[A-Za-z0-9]{6}\b/i.test(q);
        if (isJoinUrl) {
            return { results: [] };
        }
    }

    if (q.length === 0) {
        const results = await fetchOutingsForBar(barId, start, end);
        return { results };
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
    const results = await fetchOutingsForBar(barId, start, end, groupIds);

    return { results };
}

/** Helper para mensajes / tests */
export async function getBarName(barId: string): Promise<string | null> {
    const bar = await Bar.findById(barId).select('name').lean();
    return bar?.name ?? null;
}
