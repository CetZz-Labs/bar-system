import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronUp, Download, Loader2, ScrollText, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { downloadAuditLogsCsv, getAuditLogs } from "@/API/AuditLogAPI";
import {
  ACTOR_TYPE_LABELS,
  ACTOR_TYPES,
  AUDIT_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type AuditLogQuery,
} from "@/types/audit";
import { toastApiError } from "@/utils/apiError";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const METADATA_LABELS: Record<string, string> = {
  consumptionId: "Consumo",
  redemptionId: "Canje",
  outingId: "Salida",
  groupId: "Grupo",
  rewardId: "Recompensa",
  shiftId: "Turno",
  name: "Nombre",
  amount: "Monto",
  pointsSpent: "Puntos gastados",
  pointsAwarded: "Puntos otorgados",
  resolution: "Resolución",
  closureReason: "Razón de cierre",
  endReason: "Razón de fin",
  disputeReason: "Razón de disputa",
  scheduledFor: "Programada para",
  deviceInfo: "Dispositivo",
};

/** "someKey" → "Some Key" */
function camelToSpacedCase(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatMetadataValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (key.endsWith("Id") && typeof value === "string") {
    return String(value).slice(-6);
  }
  if (key === "amount" && typeof value === "number") {
    return `$${value.toLocaleString("es-AR")}`;
  }
  if (key === "scheduledFor" && typeof value === "string") {
    return formatDateTime(value);
  }
  return String(value);
}

function MetadataDetail({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return <span>—</span>;

  return (
    <div className="flex flex-col gap-1">
      {Object.entries(metadata).map(([key, value]) => (
        <div key={key} className="flex justify-between items-baseline gap-2">
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {METADATA_LABELS[key] ?? camelToSpacedCase(key)}
          </span>
          <span className="text-sm text-text-primary text-right break-all">
            {formatMetadataValue(key, value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function BarAuditLogView() {
  const { barId } = useParams<{ barId: string }>();
  const navigate = useNavigate();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [eventType, setEventType] = useState("");
  const [actorType, setActorType] = useState("");
  const [q, setQ] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filters: AuditLogQuery = {
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
    eventType: eventType || undefined,
    actorType: actorType || undefined,
    q: q || undefined,
    limit: 50,
  };

  // Paginación por cursor con useInfiniteQuery (LB-77). Los cambios de
  // filtro entran en queryKey → react-query crea una query nueva y arranca
  // desde la primera página, sin efectos de reset manuales.
  const {
    data,
    isLoading,
    isError,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["barAuditLog", barId, filters],
    queryFn: ({ pageParam }) =>
      getAuditLogs(barId!, { ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!barId,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (isError) toastApiError(error);
  }, [isError, error]);

  const handleDownloadCsv = async () => {
    if (!barId) return;
    try {
      const blob = await downloadAuditLogsCsv(barId, filters);
      triggerDownload(blob, `auditoria-${barId}.csv`);
      toast.success("Auditoría CSV descargada");
    } catch (err) {
      toastApiError(err);
    }
  };

  const isCustomIncomplete = Boolean(from && !to) || Boolean(!from && to);

  return (
    <main className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] gap-6">
      <header className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">Auditoría del bar</h1>
        {isFetching && <Loader2 size={16} className="text-text-secondary animate-spin" />}
      </header>

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="audit-from" className="overline">DESDE</label>
            <input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="audit-to" className="overline">HASTA</label>
            <input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="audit-eventType" className="overline">EVENTO</label>
            <select
              id="audit-eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            >
              <option value="">Todos</option>
              {AUDIT_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{EVENT_TYPE_LABELS[type] ?? type}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="audit-actorType" className="overline">ACTOR</label>
            <select
              id="audit-actorType"
              value={actorType}
              onChange={(e) => setActorType(e.target.value)}
              className="font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            >
              <option value="">Todos</option>
              {ACTOR_TYPES.map((type) => (
                <option key={type} value={type}>{ACTOR_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="audit-q" className="overline">BUSCAR POR TEXTO</label>
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              id="audit-q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre de actor, ID, monto..."
              className="font-ui w-full bg-surface-2 text-text-primary py-3 pl-11 pr-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            />
          </div>
        </div>

        {isCustomIncomplete && (
          <p className="text-sm text-amber-400 m-0">Elegí una fecha "desde" y "hasta" para filtrar por rango.</p>
        )}
      </div>

      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={handleDownloadCsv}>
          <Download size={18} />
          Exportar CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <Loader2 size={32} className="text-lime animate-spin mb-4" />
          <p className="text-text-secondary text-base">Cargando auditoría...</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <p className="text-error text-base mb-4">Error al cargar la auditoría</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-text-secondary text-sm">No hay registros para los filtros seleccionados.</p>
      ) : (
        <section>
          {/* Desktop table (≥ md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Evento</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 pr-3 font-medium">Entidad</th>
                  <th className="py-2 pr-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const isExpanded = expandedIds.has(entry.id);
                  return (
                    <Fragment key={entry.id}>
                      <tr key={entry.id} className="border-b border-border/50 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="py-2 pr-3 font-medium text-text-primary">
                          {EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType}
                        </td>
                        <td className="py-2 pr-3 text-text-primary">
                          {ACTOR_TYPE_LABELS[entry.actorType] ?? entry.actorType}
                          {entry.actorName ? ` · ${entry.actorName}` : ""}
                        </td>
                        <td className="py-2 pr-3 text-text-secondary">
                          {entry.entityType ? `${entry.entityType}${entry.entityId ? ` · ${entry.entityId.slice(-6)}` : ""}` : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(entry.id)}
                            className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
                            aria-label={isExpanded ? "Colapsar detalle" : "Expandir detalle"}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${entry.id}-detail`} className="border-b border-border/50">
                          <td colSpan={5} className="py-2 px-3 text-text-secondary">
                            <MetadataDetail metadata={entry.metadata} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile compact rows (< md) */}
          <div className="md:hidden">
            {items.map((entry) => {
              const isExpanded = expandedIds.has(entry.id);
              return (
                <div key={entry.id} className="border-b border-border py-3 flex flex-col gap-1">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-xs uppercase text-text-secondary whitespace-nowrap">Fecha</span>
                    <span className="text-sm text-text-primary text-right">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-xs uppercase text-text-secondary whitespace-nowrap">Evento</span>
                    <span className="text-sm text-text-primary text-right font-medium">{EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-xs uppercase text-text-secondary whitespace-nowrap">Actor</span>
                    <span className="text-sm text-text-primary text-right">
                      {ACTOR_TYPE_LABELS[entry.actorType] ?? entry.actorType}
                      {entry.actorName ? ` · ${entry.actorName}` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-xs uppercase text-text-secondary whitespace-nowrap">Entidad</span>
                    <span className="text-sm text-text-secondary text-right">
                      {entry.entityType ? `${entry.entityType}${entry.entityId ? ` · ${entry.entityId.slice(-6)}` : ""}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs uppercase text-text-secondary whitespace-nowrap">Detalle</span>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(entry.id)}
                      className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
                      aria-label={isExpanded ? "Colapsar detalle" : "Expandir detalle"}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="pt-2">
                      <MetadataDetail metadata={entry.metadata} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="surface"
                size="md"
                onClick={() => fetchNextPage()}
                disabled={isFetching}
              >
                {isFetching ? <Loader2 size={18} className="animate-spin" /> : <ScrollText size={18} />}
                Cargar más
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
