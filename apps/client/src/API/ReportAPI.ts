import { isAxiosError } from "axios";
import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import { REPORT_KIND_FILE_SLUGS, type ReportDownloadResult, type ReportQuery } from "@/types/reports";

/**
 * Descarga de reportes del bar (OWNER, LB-78). Con `responseType: "blob"`:
 * - rango < 30 días → 200 con el archivo (CSV/PDF) como Blob.
 * - rango >= 30 días → 202 con un JSON { message } (el archivo se envía por
 *   email); el body viaja como Blob, así que se lee el texto para extraer el
 *   mensaje.
 */
async function readBlobError(error: unknown): Promise<never> {
  if (isAxiosError(error) && error.response && error.response.data instanceof Blob) {
    try {
      const text = await error.response.data.text();
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) {
        throw {
          type: "server",
          message: parsed.message,
          status: error.response.status,
        };
      }
    } catch {
      // no es JSON legible → cae al error estándar
    }
  }
  return throwStandardError(error);
}

export async function downloadReport(barId: string, query: ReportQuery): Promise<ReportDownloadResult> {
  try {
    const response = await api.get(`/bars/${barId}/reports`, {
      params: query,
      responseType: "blob",
    });

    if (response.status === 202) {
      let message = "El reporte se está generando y se enviará por email";
      try {
        const text = await response.data.text();
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed?.message) message = parsed.message;
      } catch {
        // body no es JSON legible → mensaje por defecto
      }
      return { mode: "email", message };
    }

    const fileName = `reporte-${REPORT_KIND_FILE_SLUGS[query.kind]}-${barId}-${query.from.slice(0, 10)}-${query.to.slice(0, 10)}.${query.format}`;
    return { mode: "file", blob: response.data as Blob, fileName };
  } catch (error) {
    return readBlobError(error);
  }
}
