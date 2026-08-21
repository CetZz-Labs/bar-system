import { IShiftSummary } from '../models/Shift';

export type ShiftSummaryExportData = {
    shiftId: string | { toString(): string };
    barId: string | { toString(): string };
    cashierId: string | { toString(): string };
    role: string;
    deviceInfo: string;
    startedAt: Date;
    endedAt?: Date;
    endReason?: string;
    summary: IShiftSummary;
};

function formatDate(value: Date | undefined): string {
    return value ? value.toISOString() : '';
}

function csvCell(value: string | number | boolean): string {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(data: ShiftSummaryExportData): string {
    const rows: Array<[string, string | number | boolean]> = [
        ['shiftId', data.shiftId.toString()],
        ['barId', data.barId.toString()],
        ['cashierId', data.cashierId.toString()],
        ['role', data.role],
        ['deviceInfo', data.deviceInfo],
        ['startedAt', formatDate(data.startedAt)],
        ['endedAt', formatDate(data.endedAt)],
        ['endReason', data.endReason ?? ''],
        ['summaryStatus', data.summary.status],
        ['totalConsumptions', data.summary.totalConsumptions],
        ['confirmedConsumptions', data.summary.confirmedConsumptions],
        ['pendingConsumptions', data.summary.pendingConsumptions],
        ['rejectedConsumptions', data.summary.rejectedConsumptions],
        ['disputedConsumptions', data.summary.disputedConsumptions],
        ['totalAmount', data.summary.totalAmount],
        ['pointsAwarded', data.summary.pointsAwarded],
        ['redemptionCount', data.summary.redemptionCount],
        ['redemptionsAvailable', data.summary.redemptionsAvailable],
        ['generatedAt', formatDate(data.summary.generatedAt)],
    ];

    return [
        'field,value',
        ...rows.map(([field, value]) => `${csvCell(field)},${csvCell(value)}`),
    ].join('\n') + '\n';
}

function pdfText(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function buildPdf(data: ShiftSummaryExportData): Buffer {
    const lines = [
        `Shift ${data.shiftId.toString()}`,
        `Bar: ${data.barId.toString()}`,
        `Cashier: ${data.cashierId.toString()}`,
        `Started: ${formatDate(data.startedAt)}`,
        `Ended: ${formatDate(data.endedAt)}`,
        `End reason: ${data.endReason ?? ''}`,
        `Consumptions: ${data.summary.totalConsumptions}`,
        `Confirmed consumptions: ${data.summary.confirmedConsumptions}`,
        `Pending consumptions: ${data.summary.pendingConsumptions}`,
        `Rejected consumptions: ${data.summary.rejectedConsumptions}`,
        `Disputed consumptions: ${data.summary.disputedConsumptions}`,
        `Total amount: ${data.summary.totalAmount}`,
        `Points awarded: ${data.summary.pointsAwarded}`,
        `Redemptions: ${data.summary.redemptionCount} (available: ${data.summary.redemptionsAvailable})`,
    ];
    const content = [
        'BT',
        '/F1 11 Tf',
        '50 760 Td',
        `(${pdfText(lines[0])}) Tj`,
        ...lines.slice(1).flatMap((line) => ['0 -18 Td', `(${pdfText(line)}) Tj`]),
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
