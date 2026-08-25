import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { AuditLogQuery, AuditLogResponse } from "@/types/audit";

/** Lectura del log de auditoría (OWNER, LB-77). Solo lectura e inmutable. */

export async function getAuditLogs(barId: string, query: AuditLogQuery): Promise<AuditLogResponse> {
  try {
    const { data } = await api.get<AuditLogResponse>(`/bars/${barId}/audit-logs`, {
      params: query,
    });
    return data;
  } catch (error) {
    return throwStandardError(error);
  }
}

export async function downloadAuditLogsCsv(barId: string, query: AuditLogQuery): Promise<Blob> {
  try {
    const { data } = await api.get<Blob>(`/bars/${barId}/audit-logs`, {
      params: { ...query, format: "csv" },
      responseType: "blob",
    });
    return data;
  } catch (error) {
    return throwStandardError(error);
  }
}
