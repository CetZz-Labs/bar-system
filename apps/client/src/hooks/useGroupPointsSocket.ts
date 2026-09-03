import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { PointsMovement } from "@/types/points";

export interface WsEnvelope {
  eventId?: string;
  seq?: number;
}

export interface AvailablePointsForBarPayload extends WsEnvelope {
  groupId: string;
  barId: string;
  availablePoints: number;
}

export interface PointsBalanceUpdatedPayload extends WsEnvelope {
  groupId: string;
  pointsBalance: number;
  barId?: string;
  newBalance?: number;
  delta?: number;
  reason?: "consumo" | "asistencia" | "canje";
}

export type PointsMovementPayload = PointsMovement & WsEnvelope;

const MAX_SEEN_IDS = 200;

/**
 * LB-88: dedupe + orden. Exportado para tests unitarios.
 */
export function createEventGate() {
  const seenIds = new Set<string>();
  let lastSeq = 0;

  return {
    /** @returns true si el evento debe aplicarse */
    accept(envelope: WsEnvelope): boolean {
      const { eventId, seq } = envelope;
      if (eventId && seenIds.has(eventId)) return false;
      if (typeof seq === "number" && seq <= lastSeq) return false;

      if (eventId) {
        seenIds.add(eventId);
        if (seenIds.size > MAX_SEEN_IDS) {
          const first = seenIds.values().next().value;
          if (first !== undefined) seenIds.delete(first);
        }
      }
      if (typeof seq === "number") {
        lastSeq = seq;
      }
      return true;
    },
    /** Tras snapshot HTTP, alinear el piso de seq para no re-aplicar viejos. */
    bumpSeqFloor(seq: number | undefined) {
      if (typeof seq === "number" && seq > lastSeq) lastSeq = seq;
    },
    get lastSeq() {
      return lastSeq;
    },
    reset() {
      seenIds.clear();
      lastSeq = 0;
    },
  };
}

/**
 * Contrato LB-61 / LB-70 / LB-74: room del grupo + saldo en vivo.
 * LB-71: opcional `onMovement` para insertar al tope del historial.
 * LB-88: backoff exponencial (Socket.IO), dedupe eventId, orden por seq,
 * snapshot HTTP vía `onResync` al reconectar / volver de background.
 */
export function useGroupPointsSocket(
  groupId: string | undefined,
  onBalance: (payload: PointsBalanceUpdatedPayload) => void,
  onAvailablePoints?: (payload: AvailablePointsForBarPayload) => void,
  onMovement?: (payload: PointsMovementPayload) => void,
  onResync?: () => void
) {
  const onBalanceRef = useRef(onBalance);
  const onAvailableRef = useRef(onAvailablePoints);
  const onMovementRef = useRef(onMovement);
  const onResyncRef = useRef(onResync);
  const gateRef = useRef(createEventGate());

  useEffect(() => {
    onBalanceRef.current = onBalance;
    onAvailableRef.current = onAvailablePoints;
    onMovementRef.current = onMovement;
    onResyncRef.current = onResync;
  }, [onBalance, onAvailablePoints, onMovement, onResync]);

  useEffect(() => {
    if (!groupId) return;

    gateRef.current.reset();

    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    const origin = apiUrl?.replace(/\/api\/?$/, "") || "http://localhost:3000";

    // LB-88: backoff exponencial nativo de Socket.IO (1s → 30s + jitter).
    const socket: Socket = io(origin, {
      withCredentials: true,
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      // Safari/mobile: evita hangs largos cuando el OS suspende la pestaña.
      timeout: 20000,
    });

    const join = () => {
      socket.emit("join_group", { groupId });
    };

    const resync = () => {
      join();
      onResyncRef.current?.();
    };

    socket.on("connect", join);
    // Tras drop de red: re-join + snapshot HTTP (puede haber perdido eventos).
    socket.io.on("reconnect", resync);

    socket.on("points_balance_updated", (payload: PointsBalanceUpdatedPayload) => {
      if (payload.groupId !== groupId) return;
      if (!gateRef.current.accept(payload)) return;
      onBalanceRef.current(payload);
    });

    socket.on("available_points_updated", (payload: AvailablePointsForBarPayload) => {
      if (payload.groupId !== groupId) return;
      if (!gateRef.current.accept(payload)) return;
      onAvailableRef.current?.(payload);
    });

    socket.on("points_movement", (payload: PointsMovementPayload) => {
      if (payload.groupId !== groupId) return;
      if (!gateRef.current.accept(payload)) return;
      onMovementRef.current?.(payload);
    });

    // LB-88: mobile Safari suspende WS en background; al volver, snapshot.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!socket.connected) {
        socket.connect();
      }
      resync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      socket.io.off("reconnect", resync);
      socket.disconnect();
    };
  }, [groupId]);
}
