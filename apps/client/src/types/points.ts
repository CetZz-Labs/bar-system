export interface GroupBalanceByBar {
  barId: string;
  barName: string;
  points: number;
  lastActivityAt: string;
}

export interface GroupBalance {
  total: number;
  byBar: GroupBalanceByBar[];
  updatedAt: string | null;
}

export type PointsMovementType = "consumo" | "asistencia" | "canje";

export interface PointsMovement {
  id: string;
  groupId: string;
  barId: string;
  barName: string;
  /**
   * LB-111: salida que originó el movimiento. Siempre presente en la
   * respuesta REST de `GET /groups/:groupId/history`; ausente en el payload
   * del WebSocket `points_movement` (el backend no lo emite ahí — fuera de
   * alcance de LB-111, no se tocó `websocket/pointsHub.ts`).
   */
  outingId?: string;
  type: PointsMovementType;
  points: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface GroupHistoryPage {
  items: PointsMovement[];
  nextCursor: string | null;
}
