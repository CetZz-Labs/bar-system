import { IShiftSummary } from '../models/Shift';

export type ShiftSummaryExportData = {
    shiftId: string | { toString(): string };
    barId: string | { toString(): string };
    cashierId: string | { toString(): string };
    barName: string;
    cashierName: string;
    role: string;
    deviceInfo: string;
    startedAt: Date;
    endedAt?: Date;
    endReason?: string;
    summary: IShiftSummary;
};

function formatDate(value: Date | undefined): string {
    if (!value) return '';
    const d = value;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function csvCell(value: string | number | boolean): string {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(data: ShiftSummaryExportData): string {
    const endReasonLabels: Record<string, string> = {
        MANUAL: 'Cierre manual',
        KICKED_OUT: 'Cierre por inicio en otro dispositivo',
        BAR_CLOSED: 'Cierre automático por horario del bar',
    };

    const rows: Array<[string, string | number | boolean]> = [
        ['Turno', data.shiftId.toString()],
        ['Bar', data.barName],
        ['Cajero', data.cashierName],
        ['Rol', data.role],
        ['Dispositivo', data.deviceInfo],
        ['Inicio', formatDate(data.startedAt)],
        ['Cierre', formatDate(data.endedAt)],
        ['Motivo de cierre', endReasonLabels[data.endReason ?? ''] ?? data.endReason ?? ''],
        ['Total consumos', data.summary.totalConsumptions],
        ['Consumos confirmados', data.summary.confirmedConsumptions],
        ['Consumos pendientes', data.summary.pendingConsumptions],
        ['Consumos rechazados', data.summary.rejectedConsumptions],
        ['Consumos en disputa', data.summary.disputedConsumptions],
        ['Monto total', data.summary.totalAmount],
        ['Puntos otorgados', data.summary.pointsAwarded],
        ['Canjes', data.summary.redemptionCount],
        ['Fecha de generación', formatDate(data.summary.generatedAt)],
    ];

    return [
        'field,value',
        ...rows.map(([field, value]) => `${csvCell(field)},${csvCell(value)}`),
    ].join('\n') + '\n';
}

function pdfText(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

const endReasonLabelsPdf: Record<string, string> = {
    MANUAL: 'Cierre manual',
    KICKED_OUT: 'Cierre por inicio en otro dispositivo',
    BAR_CLOSED: 'Cierre automático por horario del bar',
};

export function buildPdf(data: ShiftSummaryExportData): Buffer {
    const bfb = '/F1 14 Tf';
    const bfBody = '/F1 11 Tf';

    function sectionLine(label: string, value: string | number): string[] {
        return [
            `0 -20 Td`,
            `(${pdfText(label)}: ${pdfText(String(value))}) Tj`,
        ];
    }

    const content = [
        'BT',
        '/F1 18 Tf',
        '50 760 Td',
        `(${pdfText('Resumen de cierre de turno')}) Tj`,

        // Sección: Datos del turno
        '0 -40 Td',
        bfb,
        `(${pdfText('Datos del turno')}) Tj`,
        bfBody,
        ...sectionLine('Bar', data.barName),
        ...sectionLine('Cajero', data.cashierName),
        ...sectionLine('Dispositivo', data.deviceInfo),
        ...sectionLine('Inicio', formatDate(data.startedAt)),
        ...sectionLine('Cierre', formatDate(data.endedAt)),
        ...sectionLine('Motivo', endReasonLabelsPdf[data.endReason ?? ''] ?? data.endReason ?? ''),

        // Sección: Consumos
        '0 -30 Td',
        bfb,
        `(${pdfText('Consumos')}) Tj`,
        bfBody,
        ...sectionLine('Total', data.summary.totalConsumptions),
        ...sectionLine('Confirmados', data.summary.confirmedConsumptions),
        ...sectionLine('Pendientes', data.summary.pendingConsumptions),
        ...sectionLine('Rechazados', data.summary.rejectedConsumptions),
        ...sectionLine('En disputa', data.summary.disputedConsumptions),
        ...sectionLine('Monto total', data.summary.totalAmount),

        // Sección: Puntos
        '0 -30 Td',
        bfb,
        `(${pdfText('Puntos')}) Tj`,
        bfBody,
        ...sectionLine('Otorgados', data.summary.pointsAwarded),

        // Sección: Canjes
        '0 -30 Td',
        bfb,
        `(${pdfText('Canjes')}) Tj`,
        bfBody,
        `0 -20 Td`,
        data.summary.redemptionsAvailable
            ? `(${pdfText(`Total: ${data.summary.redemptionCount}`)}) Tj`
            : `(${pdfText('Próximamente')}) Tj`,

        // Fecha de generación
        '0 -30 Td',
        `/F1 9 Tf`,
        `(${pdfText(`Generado el ${formatDate(data.summary.generatedAt)}`)}) Tj`,

        'ET',
    ].join('\n');

    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let index = 0; index < objects.length; index += 1) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
        pdf += `${offsets[index].toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, 'utf8');
}
