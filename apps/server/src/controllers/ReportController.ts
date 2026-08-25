import { Request, Response } from "express";
import Bar from "../models/Bar";
import { resolveOwnerAccess } from "../utils/barAccess";
import { exceedsMaxRange, DashboardRange } from "../utils/barDashboard";
import {
    buildReportCsv,
    buildReportPdf,
    getConsolidated,
    getConsumptions,
    getRedemptions,
    getShifts,
    ReportFormat,
    ReportKind,
    ReportRows,
} from "../utils/barReports";
import { ReportEmail } from "../emails/ReportEmail";

/**
 * LB-78: reportes exportables del bar (OWNER). Auth: `authenticate()` normal
 * (no `authenticateCashier`) + `resolveOwnerAccess` (403 a CASHIER), mismo
 * patrón que DashboardController (LB-74) y AuditLogController (LB-77).
 *
 * Lógica sync vs async (contrato LB-78, decisión ya tomada): si el rango
 * solicitado es >= 30 días → se genera el archivo y se envía por email
 * (adjunto), respondiendo 202 (no hay job queue autorizada — la generación
 * es síncrona y el email se encola por nodemailer). Si es < 30 días → el
 * archivo se devuelve como attachment en la respuesta.
 */

/** Umbral de "reporte largo": 30 días exactos (contrato LB-78). */
export const ASYNC_REPORT_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** Slugs en español para el nombre de archivo (LB-78 fixup): el OWNER recibe
 * el archivo por descarga o email y el nombre debe ser legible fuera del
 * sistema. Espejo manual del map del frontend (frontend.md §3: no hay
 * import cruzado entre apps). */
export const REPORT_KIND_FILE_SLUGS: Record<ReportKind, string> = {
    consumptions: 'consumos',
    redemptions: 'canjes',
    shifts: 'turnos',
    consolidated: 'consolidado',
};

function periodLabel(from: Date, to: Date): string {
    return `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`;
}

function fileName(kind: ReportKind, barId: string, from: Date, to: Date, format: ReportFormat): string {
    return `reporte-${REPORT_KIND_FILE_SLUGS[kind]}-${barId}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.${format}`;
}

async function getReportRows(kind: ReportKind, barId: string, range: DashboardRange): Promise<ReportRows> {
    switch (kind) {
        case 'consumptions':
            return getConsumptions(barId, range);
        case 'redemptions':
            return getRedemptions(barId, range);
        case 'shifts':
            return getShifts(barId, range);
        case 'consolidated':
            return getConsolidated(barId, range);
    }
}

export class ReportController {
    /**
     * GET /api/bars/:barId/reports/:kind.:format?from=X&to=Y
     * kind: consumptions | redemptions | shifts | consolidated
     * format: csv | pdf
     */
    static getReport = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        // kind/format viajan como query params (ver reportRoute.ts — el path
        // con extensión es no-determinista en Express 5.2.1, se documenta en
        // impl_LB-78.md). Ya validados por express-validator (isIn).
        const kind = req.query.kind as ReportKind;
        const format = req.query.format as ReportFormat;
        const fromRaw = req.query.from as string;
        const toRaw = req.query.to as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const bar = await Bar.findById(barId).select('name logoUrl').lean();
        if (!bar) {
            res.status(404).json({ message: 'Bar no encontrado' });
            return;
        }

        const from = new Date(fromRaw);
        const to = new Date(toRaw);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() < from.getTime()) {
            res.status(400).json({ message: 'Rango de fechas inválido' });
            return;
        }
        if (exceedsMaxRange(from, to)) {
            res.status(400).json({ message: 'El rango máximo permitido es de 3 meses' });
            return;
        }

        const range: DashboardRange = { from, to };
        const rows = await getReportRows(kind, barId, range);
        const period = periodLabel(from, to);
        const filename = fileName(kind, barId, from, to, format);
        const isLongRange = to.getTime() - from.getTime() >= ASYNC_REPORT_THRESHOLD_MS;

        // Rango largo (>= 30 días): email con adjunto + 202.
        if (isLongRange) {
            const attachment =
                format === 'csv'
                    ? { filename, content: Buffer.from(buildReportCsv(kind, rows), 'utf8') }
                    : { filename, content: await buildReportPdf(kind, rows, { barName: bar.name, logoUrl: bar.logoUrl, periodLabel: period }) };

            await ReportEmail.sendReportEmail({
                to: req.user!.email,
                barName: bar.name,
                reportType: kind,
                period,
                attachment,
            });

            res.status(202).json({
                message: `El reporte se está generando y se enviará por email a ${req.user!.email}`,
            });
            return;
        }

        // Rango corto (< 30 días): devolvemos el archivo.
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.status(200).send(buildReportCsv(kind, rows));
            return;
        }

        const pdf = await buildReportPdf(kind, rows, { barName: bar.name, logoUrl: bar.logoUrl, periodLabel: period });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(pdf);
    };
}
