import { transporter } from "../config/nodemailer";
import type { ReportKind } from "../utils/barReports";

/**
 * LB-78: email de reporte del bar para el OWNER (rango >= 30 días → Opción A
 * del contrato: generación síncrona + email con el archivo como adjunto,
 * responde 202). Mismo patrón de clase con método estático que AuthEmail.ts.
 */

export interface ReportEmailAttachment {
    filename: string;
    content: Buffer;
}

export interface SendReportEmailParams {
    to: string;
    barName: string;
    reportType: ReportKind;
    period: string;
    attachment: ReportEmailAttachment;
}

const REPORT_TYPE_LABELS: Record<ReportKind, string> = {
    consumptions: 'Consumos',
    redemptions: 'Canjes',
    shifts: 'Turnos',
    consolidated: 'Consolidado del período',
};

export class ReportEmail {
    static sendReportEmail = async ({ to, barName, reportType, period, attachment }: SendReportEmailParams) => {
        const info = await transporter.sendMail({
            from: '"La Banda" <cetzzlabs@gmail.com>',
            to,
            subject: `Reporte ${REPORT_TYPE_LABELS[reportType]} — ${barName}`,
            text:
                `Hola, te enviamos el reporte de "${barName}" (${REPORT_TYPE_LABELS[reportType]}) ` +
                `para el período ${period}. El archivo ${attachment.filename} viaja adjunto a este correo.`,
            html: `
                <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5; padding: 40px 20px; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">La Banda</h1>
                        </div>
                        <div style="padding: 30px;">
                            <h2 style="color: #1e293b; margin-top: 0;">Tu reporte está listo</h2>
                            <p style="font-size: 16px; line-height: 1.5; color: #475569;">
                                Reporte <strong>${REPORT_TYPE_LABELS[reportType]}</strong> de
                                <strong>${barName}</strong> para el período
                                <strong>${period}</strong>.
                            </p>
                            <p style="font-size: 14px; line-height: 1.5; color: #475569;">
                                El archivo <strong>${attachment.filename}</strong> viaja adjunto a este correo.
                            </p>
                        </div>
                        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                                Reporte generado por La Banda — Bar System.
                            </p>
                        </div>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: attachment.filename,
                    content: attachment.content,
                },
            ],
        });

        return info;
    };
}
