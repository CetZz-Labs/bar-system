/**
 * Tipos del selector de contexto post-login (LB-66). Espejo manual (sin
 * import cruzado, ver frontend.md §3) del contrato de
 * apps/server/src/controllers/ContextController.ts.
 */
export type ContextMode = "user" | "cashier" | "owner";

export interface ContextBarOption {
  barId: string;
  barName: string;
}

/** Respuesta de GET /api/context/options. */
export interface ContextOptions {
  user: true;
  cashier: ContextBarOption[];
  owner: ContextBarOption[];
}

export interface SelectContextPayload {
  mode: ContextMode;
  barId?: string;
  deviceInfo?: string;
}

/** Respuesta de POST /api/context/select. */
export interface SelectContextResponse {
  mode: ContextMode;
  role?: "OWNER" | "CASHIER";
  bar?: string;
  shift?: {
    startedAt: string;
  };
}
