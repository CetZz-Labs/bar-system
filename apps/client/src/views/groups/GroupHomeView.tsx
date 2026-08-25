import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Beer,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Gift,
  History,
  MapPin,
  PlusCircle,
  Users,
  Wallet,
} from "lucide-react";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupBalance, getGroupHistory } from "@/API/PointsAPI";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";
import type { PointsBalanceUpdatedPayload } from "@/hooks/useGroupPointsSocket";
import type { PointsMovement } from "@/types/points";

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function GroupHomeView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [showAllBars, setShowAllBars] = useState(false);
  const [floatDelta, setFloatDelta] = useState<number | null>(null);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [liveMovements, setLiveMovements] = useState<PointsMovement[]>([]);

  const groupQuery = useQuery({
    queryKey: ["group", slug],
    queryFn: () => getGroupBySlug(slug!),
    enabled: !!slug,
  });

  const group = groupQuery.data;
  const groupId = group?.id;

  const balanceQuery = useQuery({
    queryKey: ["groupBalance", groupId],
    queryFn: () => getGroupBalance(groupId!),
    enabled: !!groupId,
  });

  const historyQuery = useQuery({
    queryKey: ["groupHistoryPreview", groupId],
    queryFn: () => getGroupHistory(groupId!, null, 3),
    enabled: !!groupId,
  });

  const outingQuery = useQuery({
    queryKey: ["outings", "active", groupId],
    queryFn: () => getActiveOuting(groupId!),
    enabled: !!groupId,
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

  const onMovement = useCallback((payload: PointsMovement) => {
    setLiveMovements((prev) => {
      if (prev.some((m) => m.id === payload.id)) return prev;
      return [payload, ...prev].slice(0, 3);
    });
  }, []);

  useGroupPointsSocket(groupId, onBalance, undefined, onMovement);

  const total = liveTotal ?? balanceQuery.data?.total ?? 0;
  const byBar = balanceQuery.data?.byBar ?? [];
  const visibleBars = showAllBars ? byBar : byBar.slice(0, 5);
  const previewItems = useMemo(() => {
    const fromApi = historyQuery.data?.items ?? [];
    const merged = [...liveMovements, ...fromApi];
    const seen = new Set<string>();
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    }).slice(0, 3);
  }, [historyQuery.data?.items, liveMovements]);

  const outing = outingQuery.data;
  const canCreate =
    group?.currentUserRole === "LEADER" || group?.currentUserRole === "CO_LEADER";

  if (groupQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-5 pb-nav max-w-xl mx-auto">
        <div className="h-24 bg-surface-2 rounded-xl animate-pulse" />
        <div className="h-32 bg-surface-2 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="px-4 pt-10 text-center text-text-secondary">
        No encontramos el grupo.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate("/groups")}>
            Volver a grupos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 px-4 pt-5 pb-nav max-w-xl mx-auto w-full relative"
    >
      <header className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Volver"
          className="mt-1 flex justify-center items-center w-9 h-9 rounded-full bg-surface-2 border border-border"
          onClick={() => navigate("/groups")}
        >
          <ArrowLeft size={18} className="text-text-secondary" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-display font-bold m-0 truncate">{group.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex -space-x-2">
              {group.members.slice(0, 5).map((m) => (
                <Avatar
                  key={m.id}
                  alt={m.name}
                  src={m.avatarUrl ?? undefined}
                  size="sm"
                  className="ring-2 ring-bg"
                />
              ))}
            </div>
            <span className="text-sm text-text-secondary flex items-center gap-1">
              <Users size={14} />
              {group.memberCount}
            </span>
          </div>
        </div>
        <div className="relative text-right">
          <p className="overline m-0 text-text-secondary">Saldo</p>
          <p className="text-2xl font-display font-bold text-lime m-0 tabular-nums">{total}</p>
          <AnimatePresence>
            {floatDelta !== null && (
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: -12 }}
                exit={{ opacity: 0 }}
                className="absolute -left-2 top-0 text-lime text-sm font-bold"
              >
                {floatDelta > 0 ? `+${floatDelta}` : floatDelta} pts
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </header>

      {outing ? (
        <section className="rounded-xl border border-lime-border bg-lime-dim/30 p-4 flex flex-col gap-3">
          <p className="overline m-0 text-lime">Salida activa</p>
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
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => navigate(`/groups/${slug}`)}
          >
            Ver detalle
          </Button>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-surface-2 p-4 flex flex-col gap-3">
          <p className="text-text-secondary text-sm m-0">No hay una salida en curso.</p>
          {canCreate && (
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => navigate(`/groups/${slug}`)}
            >
              <PlusCircle size={18} />
              Crear nueva salida
            </Button>
          )}
        </section>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Link
          to={`/groups/${slug}`}
          className="rounded-xl border border-border bg-surface-2 p-3 flex flex-col items-center gap-2 text-center no-underline text-text-primary"
        >
          <Users size={18} className="text-lime" />
          <span className="text-xs font-medium">Mi Grupo</span>
        </Link>
        <Link
          to={`/groups/${slug}/recompensas`}
          className="rounded-xl border border-border bg-surface-2 p-3 flex flex-col items-center gap-2 text-center no-underline text-text-primary"
        >
          <Gift size={18} className="text-lime" />
          <span className="text-xs font-medium">Recompensas</span>
        </Link>
        <Link
          to={`/groups/${slug}/historial`}
          className="rounded-xl border border-border bg-surface-2 p-3 flex flex-col items-center gap-2 text-center no-underline text-text-primary"
        >
          <History size={18} className="text-lime" />
          <span className="text-xs font-medium">Historial</span>
        </Link>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="overline m-0 flex items-center gap-1">
            <Wallet size={12} /> Saldo por bar
          </p>
          <Link to={`/groups/${slug}/saldo`} className="text-xs text-lime no-underline">
            Ver saldo
          </Link>
        </div>
        {visibleBars.length === 0 ? (
          <p className="text-sm text-text-secondary m-0">Todavía no hay puntos acreditados.</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {visibleBars.map((row) => (
              <li
                key={row.barId}
                className="rounded-md border border-border bg-surface-2 px-3 py-2 flex justify-between gap-2"
              >
                <span className="truncate text-sm">{row.barName}</span>
                <span className="text-lime font-bold tabular-nums text-sm">{row.points} pts</span>
              </li>
            ))}
          </ul>
        )}
        {byBar.length > 5 && (
          <button
            type="button"
            className="mt-2 text-xs text-lime flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0"
            onClick={() => setShowAllBars((v) => !v)}
          >
            {showAllBars ? (
              <>
                Ver menos <ChevronUp size={14} />
              </>
            ) : (
              <>
                Ver más <ChevronDown size={14} />
              </>
            )}
          </button>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="overline m-0">Últimos movimientos</p>
          <Link to={`/groups/${slug}/historial`} className="text-xs text-lime no-underline">
            Ver todo
          </Link>
        </div>
        {previewItems.length === 0 ? (
          <p className="text-sm text-text-secondary m-0">Sin movimientos todavía.</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {previewItems.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border bg-surface-2 px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <Beer size={16} className="text-text-secondary shrink-0" />
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
      </section>
    </motion.div>
  );
}
