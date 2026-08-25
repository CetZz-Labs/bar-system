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
  type: PointsMovementType;
  points: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface GroupHistoryPage {
  items: PointsMovement[];
  nextCursor: string | null;
}
