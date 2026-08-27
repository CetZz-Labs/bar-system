import type { BadgeVariant } from "./Badge";

/**
 * Mapeo unico string de estado -> variante de `Badge`. Reemplaza los 3 mapas
 * de color duplicados: `BarDashboardView` (`STATUS_BADGE_CLASSES`),
 * `MyBarsView` (`config`) y `BarCategoriesView`.
 */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  // activo / en curso / aprobado
  active: "success",
  activo: "success",
  activa: "success",
  en_curso: "success",
  approved: "success",
  aprobado: "success",
  // pendiente / reservada
  pending: "warning",
  pendiente: "warning",
  reservada: "warning",
  reserved: "warning",
  // rechazo / disputa / cancelacion
  rejected: "error",
  rechazado: "error",
  disputa: "error",
  dispute: "error",
  disputed: "error",
  cancelled: "error",
  cancelada: "error",
  // terminado / inactivo / cerrado
  finalizada: "neutral",
  finalizado: "neutral",
  finished: "neutral",
  inactive: "neutral",
  inactiva: "neutral",
  inactivo: "neutral",
  closed: "neutral",
  cerrada: "neutral",
};

/** Mapea un string de estado (backend o UI) a una variante de `Badge`. */
export function statusBadgeVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status?.toLowerCase?.()] ?? "neutral";
}
