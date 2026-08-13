export type ConsumptionStatus = "PENDING_LEADER_CONFIRMATION" | "CONFIRMED" | "REJECTED" | "DISPUTED";

export interface ConsumptionBreakdownItem {
  category: string;
  quantity: number;
  subtotal: number;
}

export interface CreateConsumptionInput {
  amount: number;
  breakdown?: ConsumptionBreakdownItem[];
}

// Devuelto al crear o regenerar un consumo: el QR (data URI PNG) + código
// manual de 6 dígitos que el cajero le muestra al líder.
export interface ConsumptionQrResult {
  consumptionId: string;
  outing: string;
  amount: number;
  breakdown?: ConsumptionBreakdownItem[];
  status: ConsumptionStatus;
  qrData: string;
  manualCode: string;
  expiresAt: string;
}

export interface PendingConsumption {
  _id: string;
  amount: number;
  breakdown?: ConsumptionBreakdownItem[];
  status: ConsumptionStatus;
  expiresAt: string;
  createdAt: string;
  rejectCount?: number;
}

/** Preview del consumo para el líder (LB-61 lookup) */
export interface ConsumptionLookupResult {
  consumptionId: string;
  amount: number;
  breakdown?: ConsumptionBreakdownItem[];
  status: ConsumptionStatus;
  createdAt: string;
  bar: { id: string; name: string };
  outingId: string;
  groupId: string;
  rejectCount: number;
}

export interface ConsumptionConfirmResult {
  consumptionId: string;
  status: ConsumptionStatus;
  pointsAwarded: number;
  pointsBalance: number;
  alreadyConfirmed?: boolean;
}

export interface ConsumptionRejectResult {
  consumptionId: string;
  status: ConsumptionStatus;
  rejectCount: number;
}

// Umbral no bloqueante de la spec LB-60 (v2): monto > $500.000 dispara un
// modal de confirmación, pero el cajero puede seguir igual.
export const UNUSUAL_AMOUNT_THRESHOLD = 500_000;
