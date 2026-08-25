import { z } from "zod";

/**
 * Tipos de la vista de reportes del bar (LB-78, OWNER). Espejo manual (sin
 * import cruzado, ver frontend.md §3) del endpoint
 * `GET /api/bars/:barId/reports?kind=&format=&from=&to=` implementado en
 * apps/server/src/controllers/ReportController.ts + utils/barReports.ts.
 */

export type ReportKind = "consumptions" | "redemptions" | "shifts" | "consolidated";
export type ReportFormat = "csv" | "pdf";

export const REPORT_KIND_OPTIONS: { label: string; value: ReportKind }[] = [
  { label: "Consumos", value: "consumptions" },
  { label: "Canjes", value: "redemptions" },
  { label: "Turnos", value: "shifts" },
  { label: "Consolidado del período", value: "consolidated" },
];

/**
 * Slugs en español para el nombre de archivo descargado (LB-78 fixup).
 * Espejo manual del map homónimo de apps/server/src/controllers/
 * ReportController.ts (aislamiento del monorepo: frontend.md §3 prohíbe el
 * import cruzado, la sincronización es documental). El server arma
 * `reporte-${slug}-...` y el client debe generar EXACTAMENTE el mismo nombre
 * (no parsea Content-Disposition).
 */
export const REPORT_KIND_FILE_SLUGS: Record<ReportKind, string> = {
  consumptions: "consumos",
  redemptions: "canjes",
  shifts: "turnos",
  consolidated: "consolidado",
};

export const REPORT_FORMAT_OPTIONS: { label: string; value: ReportFormat }[] = [
  { label: "CSV", value: "csv" },
  { label: "PDF", value: "pdf" },
];

export interface ReportQuery {
  kind: ReportKind;
  format: ReportFormat;
  from: string; // ISO8601
  to: string; // ISO8601
}

/**
 * Resultado del endpoint de reportes. Con rango < 30 días el server devuelve
 * el archivo (blob → descarga); con rango >= 30 días devuelve 202 y envía el
 * archivo por email (no hay descarga inmediata).
 */
export type ReportDownloadResult =
  | { mode: "file"; blob: Blob; fileName: string }
  | { mode: "email"; message: string };

/** Schema del formulario de exportación (frontend.md §2 — zod obligatorio). */
export const reportFormSchema = z
  .object({
    kind: z.enum(["consumptions", "redemptions", "shifts", "consolidated"]),
    format: z.enum(["csv", "pdf"]),
    from: z.string().min(1, "Elegí una fecha desde"),
    to: z.string().min(1, "Elegí una fecha hasta"),
  })
  .refine((data) => data.to >= data.from, {
    message: "La fecha 'hasta' debe ser posterior a 'desde'",
    path: ["to"],
  })
  .refine((data) => {
    const from = new Date(`${data.from}T00:00:00.000Z`);
    const to = new Date(`${data.to}T23:59:59.999Z`);
    return to.getTime() - from.getTime() <= 3 * 30 * 24 * 60 * 60 * 1000;
  }, {
    message: "El rango máximo permitido es de 3 meses",
    path: ["to"],
  });

export type ReportFormData = z.infer<typeof reportFormSchema>;
