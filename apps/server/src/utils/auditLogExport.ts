import type { ActorType, AuditEventType } from "../models/AuditLog";

/**
 * LB-77: export CSV del log de auditoría. Sigue el MISMO patrón de escape
 * de `utils/shiftSummaryExport.ts:buildCsv` (`csvCell`), pero es un formato
 * de tabla (fila por evento) en vez de field/value. El consumidor OWNER
 * descarga la tabla con los filtros aplicados.
 */

export interface AuditLogRow {
    id: string;
    bar: string;
    actorType: ActorType;
    actorId: string | null;
    actorName: string | null;
    eventType: AuditEventType;
    entityType: string | null;
    entityId: string | null;
    metadata: Record<string, unknown> | null;
    deviceInfo: string | null;
    ip: string | null;
    createdAt: Date;
}

const CSV_METADATA_LABELS: Record<string, string> = {
    consumptionId: "Consumo",
    redemptionId: "Canje",
    outingId: "Salida",
    groupId: "Grupo",
    rewardId: "Recompensa",
    shiftId: "Turno",
    name: "Nombre",
    amount: "Monto",
    pointsSpent: "Puntos gastados",
    pointsAwarded: "Puntos otorgados",
    resolution: "Resolución",
    closureReason: "Razón de cierre",
    endReason: "Razón de fin",
    disputeReason: "Razón de disputa",
    scheduledFor: "Programada para",
    deviceInfo: "Dispositivo",
};

function camelToSpacedCase(key: string): string {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatMetadataValue(key: string, value: unknown): string {
    if (value == null) return "—";
    if (key.endsWith("Id") && typeof value === "string") {
        return String(value).slice(-6);
    }
    if (key === "amount" && typeof value === "number") {
        return `$${value.toLocaleString("es-AR")}`;
    }
    if (key === "scheduledFor" && typeof value === "string") {
        return new Date(value).toLocaleString("es-AR");
    }
    return String(value);
}

export function formatMetadataForCsv(metadata: Record<string, unknown> | null): string {
    if (!metadata || Object.keys(metadata).length === 0) return "";
    return Object.entries(metadata)
        .map(([key, value]) => {
            const label = CSV_METADATA_LABELS[key] ?? camelToSpacedCase(key);
            return `${label}: ${formatMetadataValue(key, value)}`;
        })
        .join(" | ");
}

function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDate(value: Date | string | null | undefined): string {
    if (!value) return '';
    return new Date(value).toISOString();
}

export function buildAuditLogCsv(rows: AuditLogRow[]): string {
    const header = [
        'ID',
        'Fecha',
        'Tipo de Actor',
        'ID del Actor',
        'Nombre del Actor',
        'Tipo de Evento',
        'Tipo de Entidad',
        'ID de Entidad',
        'Detalle',
        'Dispositivo',
        'IP',
    ];
    const lines = [header.join(',')];

    for (const row of rows) {
        lines.push(
            [
                csvCell(row.id),
                csvCell(formatDate(row.createdAt)),
                csvCell(row.actorType),
                csvCell(row.actorId),
                csvCell(row.actorName),
                csvCell(row.eventType),
                csvCell(row.entityType),
                csvCell(row.entityId),
                csvCell(formatMetadataForCsv(row.metadata)),
                csvCell(row.deviceInfo),
                csvCell(row.ip),
            ].join(',')
        );
    }

    return lines.join('\n') + '\n';
}
