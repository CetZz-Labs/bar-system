import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  MapPin,
  Clock,
  Coins,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Store,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { exploreBars } from "@/API/BarAPI";
import type { ExploreBar } from "@/types/bar";

/**
 * LB-79: listado/exploración de bares (cliente logueado). Cards clickeables
 * (mismo patrón de accesibilidad — role="button"/tabIndex/onKeyDown — que
 * `BarCard` de MyBarsView.tsx), navegan a la ficha de detalle de LB-76
 * (`/bar/:id`). Sin geolocalización ni badge "Destacado" — fuera del MVP.
 */

const DEBOUNCE_MS = 300;

function BarCard({ bar }: { bar: ExploreBar }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate(`/bar/${bar.id}`)}
      className="flex flex-col gap-3 p-4 rounded-lg bg-surface-2 border border-border cursor-pointer transition-colors hover:border-border-hover active:bg-surface-3"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/bar/${bar.id}`);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-display font-bold tracking-tight leading-tight">
          {bar.name}
        </h2>
        {bar.hasActiveCheckIn && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border bg-lime/10 text-lime border-lime/20 shrink-0">
            <CheckCircle2 size={14} />
            Estás acá
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="shrink-0" />
          <span>
            {bar.address.street} {bar.address.number}
            {bar.address.neighborhood ? `, ${bar.address.neighborhood}` : ""}, {bar.address.city}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} className="shrink-0" />
          <span>Cierra a las {bar.closingTime}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-lime font-medium">
        <Coins size={14} className="shrink-0" />
        {bar.todayAttendancePoints} pts por asistencia hoy
      </div>
    </motion.div>
  );
}

export default function ExploreBarsView() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const {
    data: bars,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["exploreBars", debounced],
    queryFn: () => exploreBars(debounced || undefined),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isError) {
      toast.error("No pudimos cargar el listado de bares");
    }
  }, [isError]);

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Explorar bares
        </h1>
      </header>

      <div className="mb-6">
        <Input
          label="Buscar bar"
          icon={<Search size={18} />}
          placeholder="Nombre del bar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar bar"
        />
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-text-secondary">
          <Loader2 size={32} className="text-lime animate-spin" />
          <p className="text-sm">Cargando bares...</p>
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 text-center">
          <AlertCircle size={48} className="text-text-muted" />
          <p className="text-error text-base">No pudimos cargar el listado de bares</p>
        </div>
      )}

      {!isLoading && !isError && bars && bars.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-2 border border-border">
            <Store size={28} className="text-text-secondary" />
          </div>
          <p className="text-text-secondary text-base">
            {debounced
              ? `No encontramos bares para "${debounced}".`
              : "Todavía no hay bares activos para mostrar."}
          </p>
        </div>
      )}

      {!isLoading && !isError && bars && bars.length > 0 && (
        <div className="flex flex-col gap-3">
          {bars.map((bar) => (
            <BarCard key={bar.id} bar={bar} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
