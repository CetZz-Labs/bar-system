import { z } from "zod";

/**
 * Tipos del dashboard del bar (LB-74). Espejo manual (sin import cruzado,
 * ver frontend.md §3) del contrato técnico
 * (`GET /api/bars/:barId/dashboard`, `PATCH
 * /api/bars/:barId/consumptions/:consumptionId/resolve`) implementado en
 * apps/server/src/controllers/DashboardController.ts +
 * apps/server/src/utils/barDashboard.ts.
 */

export type DashboardPeriodType = "today" | "week" | "month" | "custom";

/** Estado derivado por fila de la tabla de actividad (no es Outing.status). */
export type ActivityRowStatus = "en_curso" | "finalizada" | "reservada" | "disputa";

export const PERIOD_OPTIONS: { label: string; value: DashboardPeriodType }[] = [
  { label: "Hoy", value: "today" },
  { label: "Semana", value: "week" },
  { label: "Mes", value: "month" },
  { label: "Personalizado", value: "custom" },
];

export const ACTIVITY_STATUS_LABELS: Record<ActivityRowStatus, string> = {
  en_curso: "En curso",
  finalizada: "Finalizada",
  reservada: "Reservada",
  disputa: "Disputa",
};

export interface DashboardStatCards {
  groupsCount: number;
  consumptionTotalArs: number;
  pointsAwarded: {
    consumption: number;
    attendance: number;
    total: number;
  };
  redemptions: {
    count: number;
    arsEquivalent: number;
  };
}

export interface ActivityRow {
  outingId: string;
  groupId: string | null;
  groupName: string;
  checkedInAt: string | null;
  consumptionArs: number;
  pointsAwarded: number;
  cashierId: string | null;
  cashierName: string | null;
  status: ActivityRowStatus;
}

export interface DisputeRow {
  consumptionId: string;
  outingId: string;
  groupId: string | null;
  groupName: string;
  amount: number;
  cashierId: string | null;
  cashierName: string | null;
  createdAt: string;
  rejectCount: number;
}

export interface CashierRow {
  cashierId: string;
  cashierName: string;
  checkIns: number;
  consumptionArs: number;
  pointsAwarded: number;
  redemptionsCount: number;
  redemptionsArs: number;
  net: number;
}

export interface CashierTableTotals {
  checkIns: number;
  consumptionArs: number;
  pointsAwarded: number;
  redemptionsCount: number;
  redemptionsArs: number;
  net: number;
}

export interface CashierTable {
  rows: CashierRow[];
  totals: CashierTableTotals;
}

export interface BarDashboardResponse {
  period: { type: DashboardPeriodType; from: string; to: string };
  statCards: DashboardStatCards;
  activity: ActivityRow[];
  disputes: DisputeRow[];
  cashiers: CashierTable;
}

export interface BarDashboardQuery {
  period: DashboardPeriodType;
  from?: string;
  to?: string;
  cashierId?: string;
  status?: ActivityRowStatus;
}

export type ConsumptionResolutionOutcome = "ACCEPTED" | "REJECTED";

/**
 * Schema del modal "Resolver disputa" (frontend.md §2 — zod obligatorio
 * como resolver de react-hook-form).
 */
export const resolveDisputeFormSchema = z.object({
  outcome: z.enum(["ACCEPTED", "REJECTED"]),
  note: z
    .string()
    .trim()
    .min(1, "El motivo es requerido")
    .max(300, "Máximo 300 caracteres"),
});

export type ResolveDisputeFormData = z.infer<typeof resolveDisputeFormSchema>;

export interface ResolveDisputeInput {
  outcome: ConsumptionResolutionOutcome;
  note: string;
}

export interface ResolveDisputeResponse {
  consumptionId: string;
  status: "RESOLVED_BY_OWNER";
  resolutionOutcome: ConsumptionResolutionOutcome;
  pointsAwarded: number;
}
