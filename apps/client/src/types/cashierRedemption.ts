import { z } from "zod";
import type { RedemptionStatus } from "./redemption";

/**
 * Tipos de la validación/entrega de un canje por el CAJERO (LB-69). Espejo
 * manual (sin import cruzado, ver frontend.md §3) del DTO de
 * apps/server/src/controllers/CashierRedemptionController.ts. Complementa
 * (no reemplaza) types/redemption.ts, que cubre el flujo del líder (LB-68).
 */

/** Respuesta de `POST /api/redemptions/:tokenOrCode/lookup` (preview, no muta nada). */
export interface CashierRedemptionPreview {
  redemptionId: string;
  group: { id: string; name: string };
  leader: { id: string; name: string };
  rewardName: string;
  pointsRequired: number;
  createdAt: string;
  expiresAt: string;
}

/** Respuesta de `POST /api/redemptions/:tokenOrCode/validate`. */
export interface CashierRedemptionValidateResult {
  redemptionId: string;
  status: RedemptionStatus;
  pointsBalance?: number;
  stockRemaining?: number | null;
  rejectionReason?: string;
  availablePoints: number;
}

export type CashierRedemptionAction = "deliver" | "reject";

/**
 * Motivos predefinidos de rechazo (LB-69). El backend solo exige `reason`
 * como string no vacío (ver routes/cashierRedemptionRoute.ts) — el enum
 * cerrado + el texto libre de "Otro" son una regla exclusivamente de UI,
 * combinados acá en un único string final antes de mandarlo al backend.
 */
export const REJECTION_REASON_OPTIONS = ["Sin stock físico", "Grupo se retiró", "Otro"] as const;
export type RejectionReasonOption = (typeof REJECTION_REASON_OPTIONS)[number];

const OTHER_TEXT_MAX_LENGTH = 200;

export const rejectRedemptionFormSchema = z
  .object({
    reasonOption: z.enum(REJECTION_REASON_OPTIONS, {
      message: "Elegí un motivo",
    }),
    otherText: z
      .string()
      .trim()
      .max(OTHER_TEXT_MAX_LENGTH, `Máximo ${OTHER_TEXT_MAX_LENGTH} caracteres`)
      .optional(),
  })
  .refine((data) => data.reasonOption !== "Otro" || !!data.otherText, {
    message: "Contanos el motivo",
    path: ["otherText"],
  });

export type RejectRedemptionFormData = z.infer<typeof rejectRedemptionFormSchema>;

/** Arma el string final que viaja como `reason` al backend. */
export function buildRejectionReason(data: RejectRedemptionFormData): string {
  return data.reasonOption === "Otro" ? data.otherText!.trim() : data.reasonOption;
}
