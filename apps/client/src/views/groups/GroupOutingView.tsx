import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Beer,
  CalendarCheck,
  CalendarClock,
  Gift,
  Loader2,
  MapPin,
  PlusCircle,
  Wallet,
} from "lucide-react";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupBalance, getGroupHistory } from "@/API/PointsAPI";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconButton } from "@/components/ui/IconButton";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";
import type { PointsBalanceUpdatedPayload } from "@/hooks/useGroupPointsSocket";
import type { PointsMovement } from "@/types/points";
import { GroupRewardsSection } from "./components/GroupRewardsSection";

/**
 * LB-111: vista dedicada a la salida activa del grupo — "Home = mirar,
 * Salida = actuar" (decisión de producto de Mariano, 15/09). Ensambla:
 *  - Saldo del grupo (`getGroupBalance`, en vivo vía WebSocket, igual patrón
 *    que `GroupBalanceView.tsx`).
 *  - Detalle de la salida activa/pendiente (`getActiveOuting`).
 *  - Recompensas + canje end-to-end (`GroupRewardsSection`, extraída de
 *    `GroupRewardsView.tsx` para no duplicar esa lógica acá).
 *  - Movimientos de puntos de **esta salida específica**, filtrando
 *    `getGroupHistory` por el nuevo query param `outingId` (LB-111 backend).
 *
 * Nota: el WebSocket `points_movement` no lleva `outingId` en su payload
 * (`apps/server/src/websocket/pointsHub.ts` no fue tocado por este ticket —
 * fuera de alcance). Por eso, ante un evento en vivo, esta vista hace
 * `refetch()` del historial filtrado en vez de mergear el payload como
 * hacen `GroupHomeView`/`GroupHistoryView` con el historial general.
 */

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function MovementIcon({ type }: { type: PointsMovement["type"] }) {
  if (type === "asistencia") return <CalendarCheck size={16} className="text-text-secondary" />;
  if (type === "canje") return <Gift size={16} className="text-text-secondary" />;
  return <Beer size={16} className="text-text-secondary" />;
}

export default function GroupOutingView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [floatDelta, setFloatDelta] = useState<number | null>(null);

  const backToHome = () => navigate(slug ? `/groups/${slug}/home` : "/groups");

  const groupQuery = useQuery({
    queryKey: ["group", slug],
    queryFn: () => getGroupBySlug(slug!),
    enabled: !!slug,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const group = groupQuery.data;
  const groupId = group?.id;
  const canManage =
    group?.currentUserRole === "LEADER" || group?.currentUserRole === "CO_LEADER";

  const balanceQuery = useQuery({
    queryKey: ["groupBalance", groupId],
    queryFn: () => getGroupBalance(groupId!),
    enabled: !!groupId,
    refetchOnWindowFocus: false,
  });

  const outingQuery = useQuery({
    queryKey: ["outings", "active", groupId],
    queryFn: () => getActiveOuting(groupId!),
    enabled: !!groupId,
    refetchOnWindowFocus: false,
  });

  const outing = outingQuery.data;

  const historyQuery = useInfiniteQuery({
    queryKey: ["groupHistory", groupId, "outing", outing?._id],
    enabled: !!groupId && !!outing?._id,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getGroupHistory(groupId!, pageParam, 20, outing!._id),
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
  });

  const onBalance = useCallback(
    (payload: PointsBalanceUpdatedPayload) => {
      setLiveTotal(payload.pointsBalance);
      if (payload.delta && payload.delta !== 0) {
        setFloatDelta(payload.delta);
        window.setTimeout(() => setFloatDelta(null), 1800);
      }
      void balanceQuery.refetch();
    },
    [balanceQuery]
  );

  // Ver nota de archivo: no podemos filtrar el payload en vivo por outingId,
  // así que ante cualquier movimiento del grupo refrescamos el historial ya
  // filtrado en el server en vez de mergear de forma optimista.
  const onMovement = useCallback(() => {
    void historyQuery.refetch();
  }, [historyQuery]);

  const onResync = useCallback(() => {
    void balanceQuery.refetch();
    void historyQuery.refetch();
  }, [balanceQuery, historyQuery]);

  useGroupPointsSocket(groupId, onBalance, undefined, onMovement, onResync);

  const total = liveTotal ?? balanceQuery.data?.total ?? 0;
  const pages = historyQuery.data?.pages ?? [];
  const movements = pages.flatMap((p) => p?.items ?? []);

  if (groupQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-5 pb-nav max-w-xl mx-auto">
        <div className="h-24 bg-surface-2 rounded-xl animate-pulse" />
        <div className="h-32 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (groupQuery.isError || !group) {
    return (
      <div className="px-4 pt-10">
        <ErrorState
          title="No pudimos cargar el grupo."
          description="Revisá tu conexión e intentá de nuevo."
          onRetry={() => groupQuery.refetch()}
          onBack={() => navigate("/groups")}
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 px-4 pt-5 pb-nav max-w-xl mx-auto w-full relative"
    >
      <header className="flex items-center gap-3">
        <IconButton aria-label="Volver" onClick={backToHome}>
          <ArrowLeft size={18} className="text-text-secondary" />
        </IconButton>
        <div>
          <h1 className="text-xl font-display font-bold m-0">Salida</h1>
          <p className="text-sm text-text-secondary m-0">{group.name}</p>
        </div>
      </header>

      <Card padding="md" className="relative text-center">
        <Wallet className="mx-auto text-lime mb-2" size={20} />
        <p className="overline m-0">Saldo del grupo</p>
        <p className="text-3xl font-display font-bold text-lime m-0 tabular-nums">{total}</p>
        <p className="text-xs text-text-secondary m-0 mt-1">puntos</p>
        <AnimatePresence>
          {floatDelta !== null && (
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: -8 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 top-3 text-lime font-bold"
            >
              {floatDelta > 0 ? `+${floatDelta}` : floatDelta} pts
            </motion.span>
          )}
        </AnimatePresence>
      </Card>

      {outing ? (
        <Card padding="md" className="border-lime-border bg-lime-dim/30 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="overline m-0 text-lime">Salida</p>
            <Badge variant={outing.status === "ACTIVE" ? "success" : "neutral"}>
              {outing.status === "ACTIVE" ? "En curso" : "Planificada"}
            </Badge>
          </div>
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-lime mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="font-display font-bold m-0 truncate">{outing.bar.name}</p>
              <p className="text-sm text-text-secondary m-0 flex items-center gap-1 mt-1">
                <CalendarClock size={14} />
                {outing.checkedInAt
                  ? `Check-in ${new Date(outing.checkedInAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : new Date(outing.scheduledFor).toLocaleString("es-AR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
              </p>
              <p className="text-xs text-text-secondary m-0 mt-1">
                {outing.invitees?.length ?? 0} invitados
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding="none" className="p-4">
          <EmptyState
            icon={PlusCircle}
            title="Todavía no hay una salida"
            description="Creá una salida para invitar al grupo y empezar a sumar puntos en el bar."
            className="py-6"
            action={
              canManage ? (
                <Button variant="primary" size="md" onClick={() => navigate(`/groups/${slug}`)}>
                  <PlusCircle size={18} />
                  Crear salida
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {outing && (
        <section className="flex flex-col gap-3">
          <p className="overline m-0">Recompensas</p>
          <GroupRewardsSection groupId={groupId} canManageRedemptions={canManage} onBack={backToHome} />
        </section>
      )}

      {outing && (
        <section className="flex flex-col gap-2">
          <p className="overline m-0">Movimientos de esta salida</p>
          {historyQuery.isLoading ? (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <Loader2 className="animate-spin" size={16} />
              Cargando...
            </div>
          ) : historyQuery.isError ? (
            <ErrorState
              title="No pudimos cargar los movimientos."
              onRetry={() => historyQuery.refetch()}
              className="py-6"
            />
          ) : movements.length === 0 ? (
            <p className="text-sm text-text-secondary m-0">
              Todavía no hay movimientos en esta salida.
            </p>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {movements.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-surface-2 px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <MovementIcon type={item.type} />
                    <div className="min-w-0">
                      <p className="text-sm m-0 truncate">{item.barName}</p>
                      <p className="text-xs text-text-secondary m-0 capitalize">
                        {item.type} · {relativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      item.points >= 0 ? "text-lime" : "text-text-secondary"
                    }`}
                  >
                    {item.points >= 0 ? `+${item.points}` : item.points}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {historyQuery.hasNextPage && (
            <button
              type="button"
              className="font-ui text-sm text-lime bg-transparent border border-border rounded-md py-2 cursor-pointer"
              disabled={historyQuery.isFetchingNextPage}
              onClick={() => historyQuery.fetchNextPage()}
            >
              {historyQuery.isFetchingNextPage ? "Cargando..." : "Cargar más"}
            </button>
          )}
        </section>
      )}
    </motion.div>
  );
}
