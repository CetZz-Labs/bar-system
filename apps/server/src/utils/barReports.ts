import { Types } from "mongoose";
import Consumption, { ConsumptionStatus } from "../models/Consumption";
import Redemption, { RedemptionStatus } from "../models/Redemption";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import Outing from "../models/Outing";
import Shift from "../models/Shift";
import User from "../models/User";
import Group from "../models/Group";
import type { BarUserRole } from "../models/BarUser";
import { DashboardRange, exceedsMaxRange, getDashboardStatCards } from "./barDashboard";
import { pointsToArs } from "./points";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * Reportes exportables del bar (LB-78, OWNER). Mismo criterio de reuso que
 * `utils/barDashboard.ts` (LB-74): las 4 queries de datos quedan exportadas e
 * independientes del controller HTTP, y los reportes del dashboard reusan las
 * funciones de agregación de `barDashboard` (`getDashboardStatCards` para el
 * consolidado) sin duplicar los `aggregate()`.
 *
 * `buildReportCsv` sigue el patrón de escape de `utils/auditLogExport.ts`
 * (`csvCell`, LB-77). `buildReportPdf` genera el PDF con `pdfmake`
 * (autorizado explícitamente para este ticket, ver contrato LB-78):
 * docDefinition con header (nombre del bar + logo + período), tabla de
 * filas y totales al pie.
 *
 * Nota de contrato: el archivo `contratos/bar-reports-export.md` citado en la
 * orden de trabajo NO existe en el vault (verificado 2026-08-24); los shapes
 * de fila se definieron a partir de la spec `spec-LB-78-reportes-bar.md` y de
 * los modelos reales (Consumption/Redemption/Shift/PointsTransaction), con
 * las decisiones documentadas en progress/implementers/impl_LB-78.md.
 */

export type ReportKind = 'consumptions' | 'redemptions' | 'shifts' | 'consolidated';
export type ReportFormat = 'csv' | 'pdf';

export const REPORT_KINDS: ReportKind[] = ['consumptions', 'redemptions', 'shifts', 'consolidated'];

export interface ConsumptionReportRow {
    id: string;
    groupId: string | null;
    groupName: string;
    cashierId: string | null;
    cashierName: string | null;
    amount: number;
    pointsAwarded: number;
    status: ConsumptionStatus;
    createdAt: Date;
}

export interface RedemptionReportRow {
    id: string;
    groupId: string | null;
    groupName: string;
    rewardId: string;
    rewardName: string;
    pointsRequired: number;
    arsEquivalent: number;
    status: RedemptionStatus;
    cashierId: string | null;
    cashierName: string | null;
    validatedAt: Date | null;
}

export interface ShiftReportRow {
    shiftId: string;
    cashierId: string;
    cashierName: string;
    role: BarUserRole;
    startedAt: Date;
    endedAt: Date | null;
    endReason: string | null;
    totalConsumptions: number;
    confirmedConsumptions: number;
    rejectedConsumptions: number;
    disputedConsumptions: number;
    totalAmount: number;
    pointsAwarded: number;
    redemptionCount: number;
}

export interface ConsolidatedReportRow {
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
        pointsDebited: number;
    };
    netPoints: number;
}

export type ReportRows =
    | ConsumptionReportRow[]
    | RedemptionReportRow[]
    | ShiftReportRow[]
    | ConsolidatedReportRow;

function nameOf(user: { name: string; lastName: string }): string {
    return `${user.name} ${user.lastName}`.trim();
}

/**
 * Consumos del bar en el rango (LB-78). Incluye TODOS los estados
 * (CONFIRMED, REJECTED, DISPUTED, PENDING_LEADER_CONFIRMATION, ABANDONED,
 * RESOLVED_BY_OWNER): es un reporte de conciliación para el OWNER, que
 * necesita ver lo que pasó completo, no solo lo que cuenta como válido en
 * las agregaciones del dashboard (decisión documentada en impl_LB-78.md).
 */
export async function getConsumptions(barId: string, range: DashboardRange): Promise<ConsumptionReportRow[]> {
    const consumptions = await Consumption.find({
        bar: barId,
        createdAt: { $gte: range.from, $lte: range.to },
    })
        .sort({ createdAt: -1 })
        .lean();

    const outingIds = [...new Set(consumptions.map((c) => c.outing.toString()))];
    const cashierIds = [...new Set(consumptions.map((c) => c.cashier.toString()))];

    const [outings, users] = await Promise.all([
        outingIds.length > 0
            ? Outing.find({ _id: { $in: outingIds } }).select('group').lean()
            : Promise.resolve([]),
        cashierIds.length > 0
            ? User.find({ _id: { $in: cashierIds } }).select('name lastName').lean()
            : Promise.resolve([]),
    ]);

    const groupIds = [...new Set(outings.map((o) => o.group.toString()))];
    const groups = groupIds.length > 0
        ? await Group.find({ _id: { $in: groupIds } }).select('name').lean()
        : [];

    const groupNameById = new Map(groups.map((g) => [g._id.toString(), g.name]));
    const outingGroupById = new Map(outings.map((o) => [o._id.toString(), o.group.toString()]));
    const userNameById = new Map(users.map((u) => [u._id.toString(), nameOf(u)]));

    return consumptions.map((c) => {
        const outingId = c.outing.toString();
        const groupId = outingGroupById.get(outingId) ?? null;
        const cashierId = c.cashier.toString();
        return {
            id: c._id.toString(),
            groupId,
            groupName: groupId ? (groupNameById.get(groupId) ?? '') : '',
            cashierId,
            cashierName: userNameById.get(cashierId) ?? null,
            amount: c.amount,
            pointsAwarded: c.pointsAwarded ?? 0,
            status: c.status,
            createdAt: c.createdAt,
        };
    });
}

/**
 * Canjes entregados (VALIDATED) y rechazados (REJECTED) en el rango. El
 * filtro de fecha usa `validatedAt` (cuándo el cajero resolvió el canje,
 * LB-69) — mismo criterio que la stat card de "canjes entregados" del
 * dashboard (utils/barDashboard.ts).
 */
export async function getRedemptions(barId: string, range: DashboardRange): Promise<RedemptionReportRow[]> {
    const redemptions = await Redemption.find({
        bar: barId,
        status: { $in: [RedemptionStatus.VALIDATED, RedemptionStatus.REJECTED] },
        validatedAt: { $gte: range.from, $lte: range.to },
    })
        .sort({ validatedAt: -1 })
        .lean();

    const groupIds = [...new Set(redemptions.map((r) => r.group.toString()))];
    const cashierIds = [...new Set(
        redemptions.map((r) => (r.cashier ? r.cashier.toString() : '')).filter(Boolean)
    )];

    const [groups, users] = await Promise.all([
        groupIds.length > 0
            ? Group.find({ _id: { $in: groupIds } }).select('name').lean()
            : Promise.resolve([]),
        cashierIds.length > 0
            ? User.find({ _id: { $in: cashierIds } }).select('name lastName').lean()
            : Promise.resolve([]),
    ]);

    const groupNameById = new Map(groups.map((g) => [g._id.toString(), g.name]));
    const userNameById = new Map(users.map((u) => [u._id.toString(), nameOf(u)]));

    return redemptions.map((r) => {
        const groupId = r.group.toString();
        const cashierId = r.cashier ? r.cashier.toString() : null;
        return {
            id: r._id.toString(),
            groupId,
            groupName: groupNameById.get(groupId) ?? '',
            rewardId: r.reward.toString(),
            rewardName: r.rewardNameSnapshot,
            pointsRequired: r.pointsRequiredSnapshot,
            arsEquivalent: pointsToArs(r.pointsRequiredSnapshot),
            status: r.status,
            cashierId,
            cashierName: cashierId ? (userNameById.get(cashierId) ?? null) : null,
            validatedAt: r.validatedAt ?? null,
        };
    });
}

/**
 * Turnos cerrados del bar en el rango (filtro por `startedAt`, mismo criterio
 * que ShiftSummaryController.history). Resumen consolidado: una fila por
 * turno con los campos del summary persistido (si el turno no tiene summary
 * todavía se emiten ceros — no se genera on-the-fly para no hacer N+1 en un
 * reporte de rango; decisión documentada en impl_LB-78.md).
 */
export async function getShifts(barId: string, range: DashboardRange): Promise<ShiftReportRow[]> {
    const shifts = await Shift.find({
        bar: barId,
        endedAt: { $ne: null },
        startedAt: { $gte: range.from, $lte: range.to },
    })
        .sort({ startedAt: -1 })
        .lean();

    const cashierIds = [...new Set(shifts.map((s) => s.user.toString()))];
    const users = cashierIds.length > 0
        ? await User.find({ _id: { $in: cashierIds } }).select('name lastName').lean()
        : [];
    const userNameById = new Map(users.map((u) => [u._id.toString(), nameOf(u)]));

    return shifts.map((s) => {
        const cashierId = s.user.toString();
        return {
            shiftId: s._id.toString(),
            cashierId,
            cashierName: userNameById.get(cashierId) ?? '',
            role: s.role,
            startedAt: s.startedAt,
            endedAt: s.endedAt ?? null,
            endReason: s.endReason ?? null,
            totalConsumptions: s.summary?.totalConsumptions ?? 0,
            confirmedConsumptions: s.summary?.confirmedConsumptions ?? 0,
            rejectedConsumptions: s.summary?.rejectedConsumptions ?? 0,
            disputedConsumptions: s.summary?.disputedConsumptions ?? 0,
            totalAmount: s.summary?.totalAmount ?? 0,
            pointsAwarded: s.summary?.pointsAwarded ?? 0,
            redemptionCount: s.summary?.redemptionCount ?? 0,
        };
    });
}

/**
 * Consolidado del período (LB-78): reusa `getDashboardStatCards` (misma
 * fuente de agregación que el dashboard, sin duplicar queries) y suma el
 * débito de puntos por canjes desde `PointsTransaction` (type=REDEMPTION,
 * amount negativo) — fuente de puntos del consolidated = PointsTransaction,
 * misma que barDashboard. Neto = puntos otorgados (consumo + asistencia) −
 * puntos debitados por canjes entregados.
 */
export async function getConsolidated(barId: string, range: DashboardRange): Promise<ConsolidatedReportRow> {
    const barObjectId = new Types.ObjectId(barId);

    const [statCards, debitResult] = await Promise.all([
        getDashboardStatCards(barId, range),
        PointsTransaction.aggregate<{ _id: null; total: number }>([
            {
                $match: {
                    bar: barObjectId,
                    createdAt: { $gte: range.from, $lte: range.to },
                    type: PointsTransactionType.REDEMPTION,
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
    ]);

    const pointsDebited = Math.abs(debitResult[0]?.total ?? 0);

    return {
        groupsCount: statCards.groupsCount,
        consumptionTotalArs: statCards.consumptionTotalArs,
        pointsAwarded: statCards.pointsAwarded,
        redemptions: {
            count: statCards.redemptions.count,
            arsEquivalent: statCards.redemptions.arsEquivalent,
            pointsDebited,
        },
        netPoints: statCards.pointsAwarded.total - pointsDebited,
    };
}

// ---------------------------------------------------------------------------
// Labels de estado en español (LB-78 fixup): los reportes exportables son de
// conciliación para el OWNER, que lee el archivo fuera del sistema — los
// estados crudos (PENDING_LEADER_CONFIRMATION, etc.) no son amigables ahí.
// Fallback al valor crudo si un status no está en el map (nunca rompe).
// ---------------------------------------------------------------------------

const CONSUMPTION_STATUS_LABELS: Record<string, string> = {
    [ConsumptionStatus.PENDING_LEADER_CONFIRMATION]: 'Pendiente',
    [ConsumptionStatus.CONFIRMED]: 'Confirmado',
    [ConsumptionStatus.REJECTED]: 'Rechazado',
    [ConsumptionStatus.DISPUTED]: 'En disputa',
    [ConsumptionStatus.ABANDONED]: 'Abandonado',
    [ConsumptionStatus.RESOLVED_BY_OWNER]: 'Resuelto por dueño',
};

// El reporte de canjes solo trae VALIDATED/REJECTED (ver getRedemptions);
// el resto de estados del enum no llega a estas filas.
const REDEMPTION_STATUS_LABELS: Record<string, string> = {
    [RedemptionStatus.VALIDATED]: 'Entregado',
    [RedemptionStatus.REJECTED]: 'Rechazado',
};

function statusLabel(labels: Record<string, string>, value: string): string {
    return labels[value] ?? value;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDate(value: Date | string | null | undefined): string {
    if (!value) return '';
    return new Date(value).toISOString();
}

function formatDateDay(value: Date | string | null | undefined): string {
    if (!value) return '';
    return new Date(value).toISOString().slice(0, 10);
}

/**
 * Fecha/hora en zona LOCAL (DD/MM/YYYY HH:mm) — usa getters locales
 * (getDate/getMonth/getHours/...) a propósito: `toISOString()` renderiza UTC y
 * desfasa el horario de los turnos para el OWNER. Devuelve '' si null/undefined.
 */
export function formatDateTime(value: Date | string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildCsv(header: string[], rows: Array<Array<unknown>>): string {
    const lines = [header.join(',')];
    for (const row of rows) {
        lines.push(row.map((cell) => csvCell(cell)).join(','));
    }
    return lines.join('\n') + '\n';
}

function buildConsumptionsCsv(rows: ConsumptionReportRow[]): string {
    return buildCsv(
        ['id', 'createdAt', 'groupId', 'groupName', 'cashierId', 'cashierName', 'amount', 'pointsAwarded', 'status'],
        rows.map((r) => [
            r.id,
            formatDate(r.createdAt),
            r.groupId,
            r.groupName,
            r.cashierId,
            r.cashierName,
            r.amount,
            r.pointsAwarded,
            statusLabel(CONSUMPTION_STATUS_LABELS, r.status),
        ])
    );
}

function buildRedemptionsCsv(rows: RedemptionReportRow[]): string {
    return buildCsv(
        ['id', 'validatedAt', 'groupId', 'groupName', 'rewardId', 'rewardName', 'pointsRequired', 'arsEquivalent', 'status', 'cashierId', 'cashierName'],
        rows.map((r) => [
            r.id,
            formatDate(r.validatedAt),
            r.groupId,
            r.groupName,
            r.rewardId,
            r.rewardName,
            r.pointsRequired,
            r.arsEquivalent,
            statusLabel(REDEMPTION_STATUS_LABELS, r.status),
            r.cashierId,
            r.cashierName,
        ])
    );
}

function buildShiftsCsv(rows: ShiftReportRow[]): string {
    return buildCsv(
        ['shiftId', 'startedAt', 'endedAt', 'endReason', 'cashierId', 'cashierName', 'role', 'totalConsumptions', 'confirmedConsumptions', 'rejectedConsumptions', 'disputedConsumptions', 'totalAmount', 'pointsAwarded', 'redemptionCount'],
        rows.map((r) => [
            r.shiftId,
            formatDate(r.startedAt),
            formatDate(r.endedAt),
            r.endReason,
            r.cashierId,
            r.cashierName,
            r.role,
            r.totalConsumptions,
            r.confirmedConsumptions,
            r.rejectedConsumptions,
            r.disputedConsumptions,
            r.totalAmount,
            r.pointsAwarded,
            r.redemptionCount,
        ])
    );
}

function buildConsolidatedCsv(row: ConsolidatedReportRow): string {
    return buildCsv(
        ['metric', 'value'],
        [
            ['groupsCount', row.groupsCount],
            ['consumptionTotalArs', row.consumptionTotalArs],
            ['pointsAwardedConsumption', row.pointsAwarded.consumption],
            ['pointsAwardedAttendance', row.pointsAwarded.attendance],
            ['pointsAwardedTotal', row.pointsAwarded.total],
            ['redemptionsCount', row.redemptions.count],
            ['redemptionsArsEquivalent', row.redemptions.arsEquivalent],
            ['redemptionsPointsDebited', row.redemptions.pointsDebited],
            ['netPoints', row.netPoints],
        ]
    );
}

export function buildReportCsv(kind: ReportKind, rows: ReportRows): string {
    switch (kind) {
        case 'consumptions':
            return buildConsumptionsCsv(rows as ConsumptionReportRow[]);
        case 'redemptions':
            return buildRedemptionsCsv(rows as RedemptionReportRow[]);
        case 'shifts':
            return buildShiftsCsv(rows as ShiftReportRow[]);
        case 'consolidated':
            return buildConsolidatedCsv(rows as ConsolidatedReportRow);
    }
}

// ---------------------------------------------------------------------------
// PDF (pdfmake)
// ---------------------------------------------------------------------------

export interface ReportPdfOptions {
    barName: string;
    logoUrl?: string;
    periodLabel: string;
}

// El runtime de pdfmake 0.3.11 expone `vfs` como propiedad mutable del
// module.exports (CJS). Se carga con `require` (no `import * as`/`import
// default`, que bajo el transform ESM de vitest crean objetos de namespace
// inmutables y rompen tanto `pdfMake.vfs = ...` como el contenido de las
// fuentes). Los tipos publicados no declaran `vfs` (y `getBuffer` del .d.ts
// no existe en el runtime, se usa `getBlob`) — se declara localmente la
// interfaz mínima real (backend.md §1: tipo de librería no disponible → se
// declara en el archivo, nunca `any`).
interface PdfMakeRuntime {
    vfs: Record<string, string>;
    createPdf: (doc: TDocumentDefinitions) => {
        getBlob(): Promise<Blob>;
    };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfMakeRuntime = require("pdfmake/build/pdfmake") as unknown as PdfMakeRuntime;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfFonts = require("pdfmake/build/vfs_fonts") as unknown as Record<string, string>;
pdfMakeRuntime.vfs = pdfFonts;

const REPORT_TITLES: Record<ReportKind, string> = {
    consumptions: 'Consumos',
    redemptions: 'Canjes',
    shifts: 'Turnos',
    consolidated: 'Consolidado del período',
};

function pdfCell(text: string, opts: { bold?: boolean; alignment?: 'left' | 'right' } = {}): TableCell {
    return {
        text,
        bold: opts.bold ?? false,
        alignment: opts.alignment ?? 'left',
    };
}

function buildConsumptionsPdfTable(rows: ConsumptionReportRow[]): Content[] {
    const totalArs = rows.reduce((acc, r) => acc + r.amount, 0);
    return [
        {
            table: {
                headerRows: 1,
                // '*': el texto largo (grupo, cajero, estado) wrappea en vez de
                // empujar la tabla fuera de la página (fixup LB-78, 6 columnas).
                widths: ['auto', '*', '*', '*', 'auto', 'auto'],
                body: [
                    ['Fecha', 'Grupo', 'Cajero', 'Estado', 'Monto (ARS)', 'Puntos']
                        .map((h) => pdfCell(h, { bold: true })),
                    ...rows.map((r) => [
                        pdfCell(formatDateDay(r.createdAt)),
                        pdfCell(r.groupName),
                        pdfCell(r.cashierName ?? ''),
                        pdfCell(statusLabel(CONSUMPTION_STATUS_LABELS, r.status)),
                        pdfCell(String(r.amount), { alignment: 'right' }),
                        pdfCell(String(r.pointsAwarded), { alignment: 'right' }),
                    ]),
                ],
            },
            layout: 'lightHorizontalLines',
        },
        {
            text: [
                { text: 'Total período: ', bold: true },
                { text: `$${totalArs.toLocaleString('es-AR')} ARS`, bold: true },
            ],
            margin: [0, 12, 0, 0],
        },
    ];
}

function buildRedemptionsPdfTable(rows: RedemptionReportRow[]): Content[] {
    const totalCount = rows.length;
    const totalArs = rows.reduce((acc, r) => acc + r.arsEquivalent, 0);
    return [
        {
            table: {
                headerRows: 1,
                widths: ['auto', '*', '*', 'auto', 'auto', 'auto'],
                body: [
                    ['Fecha', 'Grupo', 'Recompensa', 'Puntos', 'Valor ARS', 'Estado']
                        .map((h) => pdfCell(h, { bold: true })),
                    ...rows.map((r) => [
                        pdfCell(formatDateDay(r.validatedAt)),
                        pdfCell(r.groupName),
                        pdfCell(r.rewardName),
                        pdfCell(String(r.pointsRequired), { alignment: 'right' }),
                        pdfCell(String(r.arsEquivalent), { alignment: 'right' }),
                        pdfCell(statusLabel(REDEMPTION_STATUS_LABELS, r.status)),
                    ]),
                ],
            },
            layout: 'lightHorizontalLines',
        },
        {
            text: [
                { text: `Canjes: ${totalCount} · Valor total: `, bold: true },
                { text: `$${totalArs.toLocaleString('es-AR')} ARS`, bold: true },
            ],
            margin: [0, 12, 0, 0],
        },
    ];
}

function buildShiftsPdfTable(rows: ShiftReportRow[]): Content[] {
    const totals = rows.reduce(
        (acc, r) => ({
            totalConsumptions: acc.totalConsumptions + r.totalConsumptions,
            confirmedConsumptions: acc.confirmedConsumptions + r.confirmedConsumptions,
            totalAmount: acc.totalAmount + r.totalAmount,
            pointsAwarded: acc.pointsAwarded + r.pointsAwarded,
            redemptionCount: acc.redemptionCount + r.redemptionCount,
        }),
        { totalConsumptions: 0, confirmedConsumptions: 0, totalAmount: 0, pointsAwarded: 0, redemptionCount: 0 }
    );

    return [
        {
            table: {
                headerRows: 1,
                widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto'],
                body: [
                    ['Inicio', 'Fin', 'Cajero', 'Consumos', 'Confirmados', 'Monto (ARS)', 'Puntos']
                        .map((h) => pdfCell(h, { bold: true })),
                    ...rows.map((r) => [
                        pdfCell(formatDateTime(r.startedAt)),
                        pdfCell(formatDateTime(r.endedAt)),
                        pdfCell(r.cashierName),
                        pdfCell(String(r.totalConsumptions), { alignment: 'right' }),
                        pdfCell(String(r.confirmedConsumptions), { alignment: 'right' }),
                        pdfCell(String(r.totalAmount), { alignment: 'right' }),
                        pdfCell(String(r.pointsAwarded), { alignment: 'right' }),
                    ]),
                ],
            },
            layout: 'lightHorizontalLines',
        },
        {
            text: [
                { text: 'Totales: ', bold: true },
                {
                    text: `${totals.totalConsumptions} consumos · ${totals.confirmedConsumptions} confirmados · $${totals.totalAmount.toLocaleString('es-AR')} ARS · ${totals.pointsAwarded} puntos · ${totals.redemptionCount} canjes`,
                    bold: true,
                },
            ],
            margin: [0, 12, 0, 0],
        },
    ];
}

function buildConsolidatedPdfTable(row: ConsolidatedReportRow): Content[] {
    return [
        {
            table: {
                headerRows: 1,
                widths: ['*', 'auto'],
                body: [
                    ['Métrica', 'Valor'].map((h) => pdfCell(h, { bold: true })),
                    ['Grupos en el período', pdfCell(String(row.groupsCount), { alignment: 'right' })],
                    ['Consumo total (ARS)', pdfCell(String(row.consumptionTotalArs), { alignment: 'right' })],
                    ['Puntos otorgados — consumo', pdfCell(String(row.pointsAwarded.consumption), { alignment: 'right' })],
                    ['Puntos otorgados — asistencia', pdfCell(String(row.pointsAwarded.attendance), { alignment: 'right' })],
                    ['Puntos otorgados — total', pdfCell(String(row.pointsAwarded.total), { alignment: 'right' })],
                    ['Canjes entregados', pdfCell(String(row.redemptions.count), { alignment: 'right' })],
                    ['Canjes — valor equivalente (ARS)', pdfCell(String(row.redemptions.arsEquivalent), { alignment: 'right' })],
                    ['Canjes — puntos debitados', pdfCell(String(row.redemptions.pointsDebited), { alignment: 'right' })],
                    ['Neto de puntos', pdfCell(String(row.netPoints), { alignment: 'right' })],
                ],
            },
            layout: 'lightHorizontalLines',
        },
    ];
}

function buildReportPdfDocument(kind: ReportKind, rows: ReportRows, opts: ReportPdfOptions): TDocumentDefinitions {
    const headerContent: Content[] = [];

    // El logo solo se embebe cuando ya es data URL (`data:image/...`): una URL
    // remota obligaría a pdfmake a descargarla (falla si el logo cae y
    // bloquea la generación). El nombre del bar identifica el header siempre.
    // Decisión documentada en impl_LB-78.md.
    if (opts.logoUrl && opts.logoUrl.startsWith('data:image/')) {
        headerContent.push({ image: opts.logoUrl, width: 60, margin: [0, 0, 0, 6] });
    }
    headerContent.push({ text: opts.barName, style: 'title' });
    headerContent.push({ text: `${REPORT_TITLES[kind]} · ${opts.periodLabel}`, style: 'subtitle' });

    const bodyContent: Content[] =
        kind === 'consumptions' ? buildConsumptionsPdfTable(rows as ConsumptionReportRow[]) :
        kind === 'redemptions' ? buildRedemptionsPdfTable(rows as RedemptionReportRow[]) :
        kind === 'shifts' ? buildShiftsPdfTable(rows as ShiftReportRow[]) :
        buildConsolidatedPdfTable(rows as ConsolidatedReportRow);

    return {
        content: [
            ...headerContent,
            ...bodyContent,
        ],
        styles: {
            title: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
            subtitle: { fontSize: 11, color: '#475569', margin: [0, 0, 0, 12] },
        },
        defaultStyle: { fontSize: 10 },
        pageMargins: [40, 40, 40, 40],
    };
}

export async function buildReportPdf(kind: ReportKind, rows: ReportRows, opts: ReportPdfOptions): Promise<Buffer> {
    const doc = buildReportPdfDocument(kind, rows, opts);
    const blob = await pdfMakeRuntime.createPdf(doc).getBlob();
    return Buffer.from(await blob.arrayBuffer());
}
