import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  Users,
  Wallet,
  Trophy,
  Gift,
  AlertTriangle,
  ScrollText,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { getBarDashboard, resolveConsumptionDispute } from "@/API/BarDashboardAPI";
import {
  ACTIVITY_STATUS_LABELS,
  PERIOD_OPTIONS,
  resolveDisputeFormSchema,
  type ActivityRowStatus,
  type BarDashboardQuery,
  type DashboardPeriodType,
  type DisputeRow,
  type ResolveDisputeFormData,
} from "@/types/barDashboard";
import { toastApiError } from "@/utils/apiError";

const STATUS_OPTIONS: { label: string; value: ActivityRowStatus }[] = [
  { label: "En curso", value: "en_curso" },
  { label: "Finalizada", value: "finalizada" },
  { label: "Reservada", value: "reservada" },
  { label: "Disputa", value: "disputa" },
];

const STATUS_BADGE_CLASSES: Record<ActivityRowStatus, string> = {
  en_curso: "bg-lime/10 text-lime border-lime/20",
  finalizada: "bg-surface-3 text-text-secondary border-border",
  reservada: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  disputa: "bg-error-dim text-error border-error-border",
};

function formatArs(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-AR")}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg bg-surface-2 border border-border">
      <div className="flex items-center gap-2 text-text-secondary text-xs uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <span className="text-2xl font-display font-bold tracking-tight">{value}</span>
      {sub && <span className="text-xs text-text-secondary">{sub}</span>}
    </div>
  );
}

/**
 * Modal de resolución de disputa con motivo (react-hook-form + zod).
 * Componente local, no extiende `@/components/ui/Modal` (no admite
 * contenido de formulario) — mismo criterio ya documentado por LB-67/LB-69
 * (ver CashierRedemptionsView.tsx `RejectRedemptionModal`).
 */
function ResolveDisputeModal({
  dispute,
  onClose,
  onSubmit,
  isPending,
}: {
  dispute: DisputeRow | null;
  onClose: () => void;
  onSubmit: (data: ResolveDisputeFormData) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ResolveDisputeFormData>({
    resolver: zodResolver(resolveDisputeFormSchema),
    defaultValues: { outcome: "ACCEPTED", note: "" },
  });

  useEffect(() => {
    if (dispute) reset({ outcome: "ACCEPTED", note: "" });
  }, [dispute, reset]);

  const outcome = watch("outcome");

  return (
    <AnimatePresence>
      {dispute && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-dispute-title"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.form
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onSubmit={handleSubmit(onSubmit)}
            className="relative w-full max-w-sm bg-surface rounded-xl border border-border p-6 shadow-modal flex flex-col gap-4"
          >
            <h2 id="resolve-dispute-title" className="text-xl font-display font-bold tracking-tight m-0">
              Resolver disputa
            </h2>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm m-0">
              <dt className="text-text-secondary">Grupo</dt>
              <dd className="text-text-primary m-0">{dispute.groupName}</dd>
              <dt className="text-text-secondary">Monto</dt>
              <dd className="text-text-primary m-0">{formatArs(dispute.amount)}</dd>
              <dt className="text-text-secondary">Cajero</dt>
              <dd className="text-text-primary m-0">{dispute.cashierName ?? "—"}</dd>
            </dl>

            <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
              <legend className="overline mb-1">Resolución</legend>
              <label className="flex items-center gap-2 text-sm text-text-primary select-none">
                <input
                  type="radio"
                  value="ACCEPTED"
                  disabled={isPending}
                  {...register("outcome")}
                  className="w-4 h-4 accent-lime"
                />
                Aceptar (otorga los puntos del consumo)
              </label>
              <label className="flex items-center gap-2 text-sm text-text-primary select-none">
                <input
                  type="radio"
                  value="REJECTED"
                  disabled={isPending}
                  {...register("outcome")}
                  className="w-4 h-4 accent-lime"
                />
                Rechazar (no otorga puntos)
              </label>
            </fieldset>

            <div className="flex flex-col gap-2 w-full">
              <label className="overline">MOTIVO</label>
              <textarea
                rows={3}
                placeholder="Contá qué se resolvió y por qué..."
                disabled={isPending}
                {...register("note")}
                className={`font-ui w-full bg-surface-2 text-text-primary p-4 rounded-md text-base outline-none transition-all duration-normal ease-default border resize-none
                  ${errors.note ? "border-error" : "border-border"}
                  focus:border-lime-border focus:ring-4 focus:ring-lime-glow placeholder:text-text-secondary`}
              />
              {errors.note && <span className="font-ui text-sm text-error">{errors.note.message}</span>}
            </div>

            <div className="flex gap-3 mt-2">
              <Button type="button" variant="surface" size="md" fullWidth onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant={outcome === "ACCEPTED" ? "primary" : "danger"}
                size="md"
                fullWidth
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : outcome === "ACCEPTED" ? (
                  "Aceptar"
                ) : (
                  "Rechazar"
                )}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function BarDashboardView() {
  const { barId } = useParams<{ barId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros reflejados 1:1 en la URL (query string), deep-linkable — ver
  // contrato técnico LB-74. `period` default "today" cuando no viene en la
  // URL (decisión de implementación, el contrato no fija un default
  // explícito — ver progress/implementers/impl_LB-74.md).
  const period = (searchParams.get("period") as DashboardPeriodType | null) ?? "today";
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
  const cashierId = searchParams.get("cashierId") ?? undefined;
  const status = (searchParams.get("status") as ActivityRowStatus | null) ?? undefined;

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next, { replace: true });
  };

  const handlePeriodChange = (value: string) => {
    if (value === "custom") {
      updateParams({ period: value });
    } else {
      updateParams({ period: value, from: undefined, to: undefined });
    }
  };

  const isCustomIncomplete = period === "custom" && (!customFrom || !customTo);
  const apiFrom = period === "custom" && customFrom ? `${customFrom}T00:00:00.000Z` : undefined;
  const apiTo = period === "custom" && customTo ? `${customTo}T23:59:59.999Z` : undefined;

  const filtersQuery: BarDashboardQuery = { period, from: apiFrom, to: apiTo, cashierId, status };
  // Sin `cashierId`/`status`: solo para poblar el dropdown de cajeros con el
  // universo completo del período (si se reusara `filtersQuery`, filtrar por
  // un cajero puntual haría "desaparecer" al resto de las opciones).
  const cashierOptionsQuery: BarDashboardQuery = { period, from: apiFrom, to: apiTo };

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["barDashboard", barId, "main", filtersQuery],
    queryFn: () => getBarDashboard(barId!, filtersQuery),
    enabled: !!barId && !isCustomIncomplete,
    retry: 1,
    refetchOnWindowFocus: false,
    // Auto-refresh opcional según la spec (fuera de alcance bloqueante) —
    // se incluye porque no atrasa la implementación.
    refetchInterval: 60_000,
  });

  const { data: cashierOptionsData } = useQuery({
    queryKey: ["barDashboard", barId, "cashierOptions", cashierOptionsQuery],
    queryFn: () => getBarDashboard(barId!, cashierOptionsQuery),
    enabled: !!barId && !isCustomIncomplete,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const cashierOptions = cashierOptionsData?.cashiers.rows.map((row) => ({
    id: row.cashierId,
    name: row.cashierName,
  })) ?? [];

  const [disputeToResolve, setDisputeToResolve] = useState<DisputeRow | null>(null);

  const resolveMutation = useMutation({
    mutationFn: ({ consumptionId, data: formData }: { consumptionId: string; data: ResolveDisputeFormData }) =>
      resolveConsumptionDispute(barId!, consumptionId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barDashboard", barId] });
      toast.success("Disputa resuelta correctamente");
      setDisputeToResolve(null);
    },
    onError: toastApiError,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <Loader2 size={32} className="text-lime animate-spin mb-4" />
        <p className="text-text-secondary text-base">Cargando dashboard...</p>
      </div>
    );
  }

  if (isError || (!data && !isCustomIncomplete)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <p className="text-error text-base mb-4">Error al cargar el dashboard del bar</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] gap-6"
    >
      {/* Header */}
      <header className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">Dashboard</h1>
        {isFetching && <Loader2 size={16} className="text-text-secondary animate-spin" />}
      </header>

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <SegmentedControl
          name="period"
          label="PERÍODO"
          options={PERIOD_OPTIONS}
          value={period}
          onChange={handlePeriodChange}
        />

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="dashboard-from-date" className="overline">DESDE</label>
              <input
                id="dashboard-from-date"
                type="date"
                value={customFrom}
                onChange={(e) => updateParams({ from: e.target.value || undefined })}
                className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="dashboard-to-date" className="overline">HASTA</label>
              <input
                id="dashboard-to-date"
                type="date"
                value={customTo}
                onChange={(e) => updateParams({ to: e.target.value || undefined })}
                className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="dashboard-cashier-filter" className="overline">CAJERO</label>
            <select
              id="dashboard-cashier-filter"
              value={cashierId ?? ""}
              onChange={(e) => updateParams({ cashierId: e.target.value || undefined })}
              className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            >
              <option value="">Todos</option>
              {cashierOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="dashboard-status-filter" className="overline">ESTADO</label>
            <select
              id="dashboard-status-filter"
              value={status ?? ""}
              onChange={(e) => updateParams({ status: e.target.value || undefined })}
              className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isCustomIncomplete && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle size={20} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400 m-0">Elegí una fecha "desde" y "hasta" para ver el período personalizado.</p>
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Users size={16} />} label="Grupos" value={data.statCards.groupsCount} />
            <StatCard icon={<Wallet size={16} />} label="Consumo total" value={formatArs(data.statCards.consumptionTotalArs)} />
            <StatCard
              icon={<Trophy size={16} />}
              label="Puntos otorgados"
              value={data.statCards.pointsAwarded.total}
              sub={`Consumo: ${data.statCards.pointsAwarded.consumption} · Asistencia: ${data.statCards.pointsAwarded.attendance}`}
            />
            <StatCard
              icon={<Gift size={16} />}
              label="Canjes entregados"
              value={data.statCards.redemptions.count}
              sub={formatArs(data.statCards.redemptions.arsEquivalent)}
            />
          </div>

          {/* LB-77 (log de auditoría) no está implementado todavía — botón
              deshabilitado, mismo patrón que LB-72 dejó "Canjear"
              deshabilitado hasta que LB-68 estuvo listo. */}
          <Button variant="surface" size="md" fullWidth disabled title="Próximamente (LB-77)">
            <ScrollText size={18} />
            VER REGISTROS (PRÓXIMAMENTE)
          </Button>

          {/* Panel de disputas */}
          {data.disputes.length > 0 && (
            <section className="flex flex-col gap-3 p-4 rounded-lg bg-error-dim border border-error-border">
              <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2 text-error m-0">
                <AlertTriangle size={20} />
                Disputas abiertas ({data.disputes.length})
              </h2>
              <div className="flex flex-col gap-3">
                {data.disputes.map((dispute) => (
                  <div
                    key={dispute.consumptionId}
                    className="flex flex-col gap-2 p-3 rounded-md bg-surface border border-error-border"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-text-primary">{dispute.groupName}</span>
                      <span className="text-text-primary">{formatArs(dispute.amount)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-text-secondary">
                      <span className="flex items-center gap-1">
                        <UserRound size={14} />
                        {dispute.cashierName ?? "—"}
                      </span>
                      <span>{formatDateTime(dispute.createdAt)}</span>
                      <span>Rechazos: {dispute.rejectCount}</span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDisputeToResolve(dispute)}
                      disabled={resolveMutation.isPending}
                    >
                      Resolver
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tabla de actividad */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-display font-bold tracking-tight m-0">Actividad del período</h2>
            {data.activity.length === 0 ? (
              <p className="text-text-secondary text-sm">No hay salidas para los filtros seleccionados.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.activity.map((row) => (
                  <div key={row.outingId} className="flex flex-col gap-2 p-4 rounded-lg bg-surface-2 border border-border">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-display font-bold tracking-tight leading-tight m-0">{row.groupName}</h3>
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${STATUS_BADGE_CLASSES[row.status]}`}>
                        {ACTIVITY_STATUS_LABELS[row.status]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
                      <span>{formatDateTime(row.checkedInAt)}</span>
                      <span className="flex items-center gap-1"><UserRound size={14} />{row.cashierName ?? "—"}</span>
                      <span>Consumo: {formatArs(row.consumptionArs)}</span>
                      <span>Puntos: {row.pointsAwarded}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Tabla de cajeros */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-display font-bold tracking-tight m-0">Cajeros</h2>
            {data.cashiers.rows.length === 0 ? (
              <p className="text-text-secondary text-sm">No hay cajeros activos en este bar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-text-secondary border-b border-border">
                      <th className="py-2 pr-3 font-medium">Cajero</th>
                      <th className="py-2 pr-3 font-medium">Check-ins</th>
                      <th className="py-2 pr-3 font-medium">Consumo</th>
                      <th className="py-2 pr-3 font-medium">Puntos</th>
                      <th className="py-2 pr-3 font-medium">Canjes</th>
                      <th className="py-2 pr-3 font-medium">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cashiers.rows.map((row) => (
                      <tr key={row.cashierId} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-text-primary">{row.cashierName}</td>
                        <td className="py-2 pr-3">{row.checkIns}</td>
                        <td className="py-2 pr-3">{formatArs(row.consumptionArs)}</td>
                        <td className="py-2 pr-3">{row.pointsAwarded}</td>
                        <td className="py-2 pr-3">{row.redemptionsCount} ({formatArs(row.redemptionsArs)})</td>
                        <td className="py-2 pr-3 font-medium text-text-primary">{formatArs(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-text-primary">
                      <td className="py-2 pr-3">Totales</td>
                      <td className="py-2 pr-3">{data.cashiers.totals.checkIns}</td>
                      <td className="py-2 pr-3">{formatArs(data.cashiers.totals.consumptionArs)}</td>
                      <td className="py-2 pr-3">{data.cashiers.totals.pointsAwarded}</td>
                      <td className="py-2 pr-3">{data.cashiers.totals.redemptionsCount} ({formatArs(data.cashiers.totals.redemptionsArs)})</td>
                      <td className="py-2 pr-3">{formatArs(data.cashiers.totals.net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <ResolveDisputeModal
        dispute={disputeToResolve}
        onClose={() => setDisputeToResolve(null)}
        onSubmit={(formData) => {
          if (!disputeToResolve) return;
          resolveMutation.mutate({ consumptionId: disputeToResolve.consumptionId, data: formData });
        }}
        isPending={resolveMutation.isPending}
      />
    </motion.div>
  );
}
