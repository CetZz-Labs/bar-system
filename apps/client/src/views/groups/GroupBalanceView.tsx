import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getGroupBalance } from "@/API/PointsAPI";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";
import type { PointsBalanceUpdatedPayload } from "@/hooks/useGroupPointsSocket";

export default function GroupBalanceView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [floatDelta, setFloatDelta] = useState<number | null>(null);

  const groupQuery = useQuery({
    queryKey: ["group", slug],
    queryFn: () => getGroupBySlug(slug!),
    enabled: !!slug,
  });
  const groupId = groupQuery.data?.id;

  const balanceQuery = useQuery({
    queryKey: ["groupBalance", groupId],
    queryFn: () => getGroupBalance(groupId!),
    enabled: !!groupId,
  });

  const onBalance = useCallback(
    (payload: PointsBalanceUpdatedPayload) => {
      setLiveTotal(payload.pointsBalance);
      if (payload.delta) {
        setFloatDelta(payload.delta);
        window.setTimeout(() => setFloatDelta(null), 1800);
      }
      void balanceQuery.refetch();
    },
    [balanceQuery]
  );

  const onResync = useCallback(() => {
    void balanceQuery.refetch();
  }, [balanceQuery]);

  useGroupPointsSocket(groupId, onBalance, undefined, undefined, onResync);

  const total = liveTotal ?? balanceQuery.data?.total ?? 0;
  const byBar = balanceQuery.data?.byBar ?? [];
  const rows = showAll ? byBar : byBar.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 px-4 pt-5 pb-nav max-w-xl mx-auto w-full relative"
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
          <h1 className="text-xl font-display font-bold m-0">Saldo del grupo</h1>
          <p className="text-sm text-text-secondary m-0">{groupQuery.data?.name}</p>
        </div>
      </header>

      <section className="rounded-xl border border-lime-border bg-lime-dim/20 p-5 text-center relative">
        <Wallet className="mx-auto text-lime mb-2" size={22} />
        <p className="overline m-0">Saldo global</p>
        <p className="text-4xl font-display font-bold text-lime m-0 tabular-nums">{total}</p>
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
        {balanceQuery.data?.updatedAt && (
          <p className="text-xs text-text-secondary m-0 mt-3">
            Actualizado {new Date(balanceQuery.data.updatedAt).toLocaleString("es-AR")}
          </p>
        )}
      </section>

      <section>
        <p className="overline m-0 mb-2">Por bar</p>
        {rows.length === 0 ? (
          <p className="text-sm text-text-secondary m-0">No hay bares con saldo &gt; 0.</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.barId}
                className="rounded-md border border-border bg-surface-2 px-4 py-3 flex justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="m-0 font-medium truncate">{row.barName}</p>
                  <p className="m-0 text-xs text-text-secondary">
                    Última actividad{" "}
                    {new Date(row.lastActivityAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="text-lime font-bold tabular-nums">{row.points}</span>
              </li>
            ))}
          </ul>
        )}
        {byBar.length > 5 && (
          <button
            type="button"
            className="mt-3 text-sm text-lime flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? (
              <>
                Ver menos <ChevronUp size={14} />
              </>
            ) : (
              <>
                Ver más ({byBar.length - 5}) <ChevronDown size={14} />
              </>
            )}
          </button>
        )}
      </section>

      <Link to={`/groups/${slug}/historial`} className="text-sm text-lime text-center">
        Ver historial de movimientos
      </Link>
    </motion.div>
  );
}
