import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Contrato LB-61 / LB-74: se une a la room del grupo y recibe
 * `points_balance_updated` con el saldo actualizado.
 */
export function useGroupPointsSocket(
  groupId: string | undefined,
  onBalance: (pointsBalance: number) => void
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

    return () => {
      socket.disconnect();
    };
  }, [groupId, onBalance]);
}
