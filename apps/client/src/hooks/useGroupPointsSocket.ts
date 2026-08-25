import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { PointsMovement } from "@/types/points";

export interface AvailablePointsForBarPayload {
  groupId: string;
  barId: string;
  availablePoints: number;
}

export interface PointsBalanceUpdatedPayload {
  groupId: string;
  pointsBalance: number;
  barId?: string;
  newBalance?: number;
  delta?: number;
  reason?: "consumo" | "asistencia" | "canje";
}

/**
 * Contrato LB-61 / LB-70 / LB-74: room del grupo + saldo en vivo.
 * LB-71: opcional `onMovement` para insertar al tope del historial.
 */
export function useGroupPointsSocket(
  groupId: string | undefined,
  onBalance: (payload: PointsBalanceUpdatedPayload) => void,
  onAvailablePoints?: (payload: AvailablePointsForBarPayload) => void,
  onMovement?: (payload: PointsMovement) => void
) {
  const onBalanceRef = useRef(onBalance);
  const onAvailableRef = useRef(onAvailablePoints);
  const onMovementRef = useRef(onMovement);

  useEffect(() => {
    onBalanceRef.current = onBalance;
    onAvailableRef.current = onAvailablePoints;
    onMovementRef.current = onMovement;
  }, [onBalance, onAvailablePoints, onMovement]);

  useEffect(() => {
    if (!groupId) return;

    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    const origin = apiUrl?.replace(/\/api\/?$/, "") || "http://localhost:3000";

    const socket: Socket = io(origin, {
      withCredentials: true,
      path: "/socket.io",
    });

    const join = () => {
      socket.emit("join_group", { groupId });
    };

    socket.on("connect", join);
    socket.on("reconnect", join);

    socket.on("points_balance_updated", (payload: PointsBalanceUpdatedPayload) => {
      if (payload.groupId === groupId) {
        onBalanceRef.current(payload);
      }
    });

    socket.on("available_points_updated", (payload: AvailablePointsForBarPayload) => {
      if (payload.groupId === groupId) {
        onAvailableRef.current?.(payload);
      }
    });

    socket.on("points_movement", (payload: PointsMovement) => {
      if (payload.groupId === groupId) {
        onMovementRef.current?.(payload);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [groupId]);
}
