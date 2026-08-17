import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";

export interface AvailablePointsForBarPayload {
  groupId: string;
  barId: string;
  availablePoints: number;
}

/**
 * Contrato LB-61 / LB-74: se une a la room del grupo y recibe
 * `points_balance_updated` con el saldo actualizado.
 *
 * LB-72: además, si se pasa `onAvailablePoints`, escucha
 * `available_points_updated` (evento emitido por LB-68/pointsHub.ts,
 * saldo disponible del grupo EN UN BAR puntual). Ambos eventos llegan a la
 * misma room `group:{groupId}`, así que se reusa la misma conexión socket
 * en vez de abrir una segunda — el segundo callback es opcional para no
 * romper la firma que ya consumen otros llamadores (ej.
 * ConfirmConsumptionView.tsx).
 */
export function useGroupPointsSocket(
  groupId: string | undefined,
  onBalance: (pointsBalance: number) => void,
  onAvailablePoints?: (payload: AvailablePointsForBarPayload) => void
) {
  useEffect(() => {
    if (!groupId) return;

    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    // VITE_API_URL is like http://localhost:3000/api → origin is without /api
    const origin = apiUrl?.replace(/\/api\/?$/, "") || "http://localhost:3000";

    const socket: Socket = io(origin, {
      withCredentials: true,
      path: "/socket.io",
    });

    socket.on("connect", () => {
      socket.emit("join_group", { groupId });
    });

    socket.on(
      "points_balance_updated",
      (payload: { groupId: string; pointsBalance: number }) => {
        if (payload.groupId === groupId) {
          onBalance(payload.pointsBalance);
        }
      }
    );

    socket.on(
      "available_points_updated",
      (payload: AvailablePointsForBarPayload) => {
        if (payload.groupId === groupId) {
          onAvailablePoints?.(payload);
        }
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [groupId, onBalance, onAvailablePoints]);
}
