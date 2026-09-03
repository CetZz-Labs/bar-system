import crypto from "crypto";
import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import Group from "../models/Group";

/**
 * Contrato WebSocket de saldo de grupo (LB-61 → LB-70/LB-74; ampliado por LB-68).
 * LB-88: cada evento lleva `eventId` (dedupe) + `seq` monotónico por grupo (orden).
 *
 * Cliente:
 *   1. Conecta a mismo origin con credentials (cookie `access_token`).
 *   2. Emite `join_group` con `{ groupId }`.
 *   3. Escucha `points_balance_updated` →
 *      `{ eventId, seq, groupId, pointsBalance, barId?, newBalance?, delta?, reason? }`
 *   4. Escucha `available_points_updated` → `{ eventId, seq, groupId, barId, availablePoints }`
 *   5. Escucha `points_movement` → item de historial + envelope LB-88.
 *
 * Auth: JWT de usuario (cookie access_token). Solo miembros del grupo pueden join.
 */
let io: Server | null = null;

/** Contador monotónico por groupId (proceso). Suficiente para ordenar en la misma instancia. */
const groupSeq = new Map<string, number>();

export type PointsBalanceReason = "consumo" | "asistencia" | "canje";

export type WsEnvelope = {
  eventId: string;
  /** Entero creciente por grupo; el cliente ignora seq <= lastApplied. */
  seq: number;
};

export type PointsBalanceUpdatedPayload = WsEnvelope & {
  groupId: string;
  pointsBalance: number;
  barId?: string;
  /** Saldo del bar tras el movimiento (si aplica). */
  newBalance?: number;
  delta?: number;
  reason?: PointsBalanceReason;
};

export type PointsMovementPayload = WsEnvelope & {
  id: string;
  groupId: string;
  barId: string;
  barName: string;
  type: PointsBalanceReason;
  points: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type AvailablePointsUpdatedPayload = WsEnvelope & {
  groupId: string;
  barId: string;
  availablePoints: number;
};

interface DecodedUserToken {
  id: string;
}

function readCookie(raw: string, name: string): string | undefined {
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function nextGroupSeq(groupId: string): number {
  const n = (groupSeq.get(groupId) ?? 0) + 1;
  groupSeq.set(groupId, n);
  return n;
}

export function makeEnvelope(groupId: string): WsEnvelope {
  return {
    eventId: crypto.randomUUID(),
    seq: nextGroupSeq(groupId),
  };
}

/** Test/helper: reinicia contadores (no usar en prod runtime salvo tests). */
export function resetGroupSeqForTests(): void {
  groupSeq.clear();
}

export function initPointsHub(httpServer: HttpServer): Server {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  io = new Server(httpServer, {
    cors: {
      origin: frontendUrl,
      credentials: true,
    },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie ?? "";
      const token = readCookie(raw, "access_token");
      if (!token) {
        next(new Error("No Autorizado"));
        return;
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedUserToken;
      if (!decoded?.id) {
        next(new Error("Token no válido"));
        return;
      }
      socket.data.userId = decoded.id;
      next();
    } catch {
      next(new Error("Token no válido o expirado"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("join_group", async (payload: { groupId?: string }) => {
      const groupId = payload?.groupId;
      const userId = socket.data.userId as string | undefined;
      if (!groupId || !userId) return;

      const group = await Group.findById(groupId).select("memberships").lean();
      if (!group) return;

      const isMember = group.memberships.some((m) => m.user.toString() === userId);
      if (!isMember) return;

      await socket.join(roomForGroup(groupId));
    });
  });

  return io;
}

export function emitGroupPointsBalance(
  groupId: string,
  pointsBalance: number,
  meta?: Omit<PointsBalanceUpdatedPayload, "groupId" | "pointsBalance" | keyof WsEnvelope>
): void {
  if (!io) return;
  const payload: PointsBalanceUpdatedPayload = {
    ...makeEnvelope(groupId),
    groupId,
    pointsBalance,
    ...meta,
  };
  io.to(roomForGroup(groupId)).emit("points_balance_updated", payload);
}

/**
 * LB-71: inserta un movimiento al tope del historial en clientes suscriptos.
 */
export function emitPointsMovement(
  payload: Omit<PointsMovementPayload, keyof WsEnvelope>
): void {
  if (!io) return;
  const full: PointsMovementPayload = {
    ...makeEnvelope(payload.groupId),
    ...payload,
  };
  io.to(roomForGroup(payload.groupId)).emit("points_movement", full);
}

/**
 * LB-68: saldo disponible del grupo en un bar puntual (no reemplaza a
 * emitGroupPointsBalance, la complementa). Se emite tras generar, cancelar
 * o expirar (lazy) un canje.
 */
export function emitAvailablePointsForBar(
  groupId: string,
  barId: string,
  availablePoints: number
): void {
  if (!io) return;
  const payload: AvailablePointsUpdatedPayload = {
    ...makeEnvelope(groupId),
    groupId,
    barId,
    availablePoints,
  };
  io.to(roomForGroup(groupId)).emit("available_points_updated", payload);
}

function roomForGroup(groupId: string): string {
  return `group:${groupId}`;
}

export function getPointsHub(): Server | null {
  return io;
}
