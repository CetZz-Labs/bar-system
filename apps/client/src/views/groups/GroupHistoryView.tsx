import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, Beer, CalendarCheck, Gift, Loader2 } from "lucide-react";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getGroupHistory } from "@/API/PointsAPI";
import { useQuery } from "@tanstack/react-query";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";
import type { PointsMovement } from "@/types/points";

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

export default function GroupHistoryView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [liveItems, setLiveItems] = useState<PointsMovement[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groupQuery = useQuery({
    queryKey: ["group", slug],
    queryFn: () => getGroupBySlug(slug!),
    enabled: !!slug,
  });
  const groupId = groupQuery.data?.id;

  const historyQuery = useInfiniteQuery({
    queryKey: ["groupHistory", groupId],
    enabled: !!groupId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getGroupHistory(groupId!, pageParam, 20),
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
  });

  const onMovement = useCallback((payload: PointsMovement) => {
    setLiveItems((prev) => {
      if (prev.some((m) => m.id === payload.id)) return prev;
      return [payload, ...prev];
    });
  }, []);

  useGroupPointsSocket(groupId, () => {}, undefined, onMovement);

  const pages = historyQuery.data?.pages ?? [];
  const apiItems = pages.flatMap((p) => p?.items ?? []);
  const seen = new Set<string>();
  const items = [...liveItems, ...apiItems].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 px-4 pt-5 pb-nav max-w-xl mx-auto w-full"
    >
      <header className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver"
          className="flex justify-center items-center w-9 h-9 rounded-full bg-surface-2 border border-border"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={18} className="text-text-secondary" />
        </button>
        <div>
          <h1 className="text-xl font-display font-bold m-0">Historial</h1>
          <p className="text-sm text-text-secondary m-0">{groupQuery.data?.name}</p>
        </div>
      </header>

      {historyQuery.isLoading ? (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Loader2 className="animate-spin" size={16} />
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary m-0">Todavía no hay movimientos.</p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full text-left rounded-md border border-border bg-surface-2 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer"
                onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <MovementIcon type={item.type} />
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-medium truncate">{item.barName}</p>
                    <p className="m-0 text-xs text-text-secondary capitalize">
                      {item.type} · {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>
                <span
                  className={`font-bold tabular-nums text-sm ${
                    item.points >= 0 ? "text-lime" : "text-text-secondary"
                  }`}
                >
                  {item.points >= 0 ? `+${item.points}` : item.points}
                </span>
              </button>
              {expandedId === item.id && (
                <p className="text-xs text-text-secondary px-4 py-2 m-0">
                  {new Date(item.createdAt).toLocaleString("es-AR")}
                </p>
              )}
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
    </motion.div>
  );
}
