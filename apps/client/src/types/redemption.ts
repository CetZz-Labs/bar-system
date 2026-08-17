/**
 * Tipos del canje de recompensas del líder (LB-68). Espejo manual (sin
 * import cruzado, ver frontend.md §3) del modelo Mongoose en
 * apps/server/src/models/Redemption.ts y del DTO de
 * apps/server/src/controllers/RedemptionController.ts. La validación/
 * entrega por el cajero (LB-69) queda fuera de este alcance — acá el canje
 * queda en estado HELD (reserva) o se cancela/vence antes de llegar a ese
 * paso.
 */
export type RedemptionStatus =
  | "HELD"
  | "VALIDATED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "ABANDONED";

export interface Redemption {
  id: string;
  group: string;
  outing: string;
  bar: string;
  reward: string;
  rewardName: string;
  pointsRequired: number;
  status: RedemptionStatus;
  manualCode: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Respuesta de `POST /api/groups/:groupId/redemptions`: el canje recién
 * creado (HELD) + el QR (data URI PNG, solo se devuelve una vez acá, no en
 * el listado) + el saldo disponible del grupo en ese bar ya descontado.
 */
export interface RedemptionQrResult extends Redemption {
  qrData: string;
  availablePoints: number;
}
