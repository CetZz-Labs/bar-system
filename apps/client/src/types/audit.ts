/**
 * Tipos de la vista de auditoría del bar (LB-77). Espejo manual (sin import
 * cruzado, ver frontend.md §3) del contrato `GET /api/bars/:barId/audit-logs`
 * implementado en apps/server/src/controllers/AuditLogController.ts.
 */

export type ActorType = "CASHIER" | "OWNER" | "SYSTEM" | "LEADER";

export const AUDIT_EVENT_TYPES = [
  "checkin.confirmed",
  "consumo.registered",
  "consumo.regenerated",
  "consumo.confirmed",
  "consumo.rejected",
  "dispute.opened",
  "dispute.resolved",
  "redemption.generated",
  "redemption.delivered",
  "redemption.rejected",
  "redemption.cancelled",
  "redemption.expired",
  "salida.closed",
  "shift.opened",
  "shift.closed",
  "shift.kicked_out",
  "reward.created",
  "reward.edited",
  "reward.deleted",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const ACTOR_TYPES: ActorType[] = ["CASHIER", "OWNER", "SYSTEM", "LEADER"];

export interface AuditLogEntry {
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
  createdAt: string;
}

export interface AuditLogQuery {
  from?: string;
  to?: string;
  eventType?: string;
  actorType?: string;
  actorId?: string;
  entityId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  "checkin.confirmed": "Check-in confirmado",
  "consumo.registered": "Consumo registrado",
  "consumo.regenerated": "Consumo regenerado",
  "consumo.confirmed": "Consumo confirmado",
  "consumo.rejected": "Consumo rechazado",
  "dispute.opened": "Disputa abierta",
  "dispute.resolved": "Disputa resuelta",
  "redemption.generated": "Canje generado",
  "redemption.delivered": "Canje entregado",
  "redemption.rejected": "Canje rechazado",
  "redemption.cancelled": "Canje cancelado",
  "redemption.expired": "Canje vencido",
  "salida.closed": "Salida cerrada",
  "shift.opened": "Turno abierto",
  "shift.closed": "Turno cerrado",
  "shift.kicked_out": "Turno cerrado (otro dispositivo)",
  "reward.created": "Recompensa creada",
  "reward.edited": "Recompensa editada",
  "reward.deleted": "Recompensa eliminada",
};

export const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  CASHIER: "Cajero",
  OWNER: "Dueño",
  SYSTEM: "Sistema",
  LEADER: "Líder",
};
