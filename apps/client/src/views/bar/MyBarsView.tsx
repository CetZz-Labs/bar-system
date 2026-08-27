import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Plus,
  Store,
  MapPin,
  Phone,
  Clock,
  ClockAlert,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { statusBadgeVariant } from "@/components/ui/badgeStatus";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMyBars } from "@/API/BarAPI";
import type { BarStatus, MyBar, BarScheduleSlot } from "@/types/bar";
import { DAY_NAMES } from "@/types/bar";

const STATUS_META: Record<BarStatus, { label: string; icon: ReactNode }> = {
  pending: { label: "Pendiente", icon: <ClockAlert size={14} /> },
  active: { label: "Activo", icon: <CheckCircle2 size={14} /> },
  rejected: { label: "Rechazado", icon: <ClockAlert size={14} /> },
};

function StatusBadge({ status }: { status: BarStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={statusBadgeVariant(status)} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

function formatSchedule(slots: BarScheduleSlot[]): string {
  const grouped = slots.reduce<Record<string, string[]>>((acc, slot) => {
    const dayName = DAY_NAMES[slot.day];
    if (!acc[dayName]) acc[dayName] = [];
    acc[dayName].push(`${slot.open} - ${slot.close}`);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([day, times]) => `${day}: ${times.join(", ")}`)
    .join(" | ");
}

function BarCard({ bar }: { bar: MyBar }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate(`/bar/${bar.id}/perfil`)}
      className="flex flex-col gap-3 p-4 rounded-xl bg-surface-2 border border-border cursor-pointer transition-colors hover:border-border-hover active:bg-surface-3"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/bar/${bar.id}/perfil`);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-display font-bold tracking-tight leading-tight">
          {bar.name}
        </h2>
        <div className="flex items-center gap-2">
          <StatusBadge status={bar.status} />
          <ChevronRight size={18} className="text-text-muted shrink-0" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="shrink-0" />
          <span>
            {bar.address.street} {bar.address.number}, {bar.address.neighborhood},{" "}
            {bar.address.city}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Phone size={14} className="shrink-0" />
          <span>{bar.phone}</span>
        </div>
        <div className="flex items-start gap-2">
          <Clock size={14} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">{formatSchedule(bar.schedule)}</span>
        </div>
      </div>

      {bar.description && (
        <p className="text-sm text-text-secondary leading-relaxed">
          {bar.description}
        </p>
      )}
    </motion.div>
  );
}

export default function MyBarsView() {
  const navigate = useNavigate();

  const { data: bars, isLoading } = useQuery({
    queryKey: ["myBars"],
    queryFn: getMyBars,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <IconButton onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={20} className="text-text-secondary" />
        </IconButton>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Mis bares
        </h1>
      </header>

      {isLoading && <Spinner center size="lg" label="Cargando bares" />}

      {!isLoading && bars && bars.length === 0 && (
        <EmptyState
          icon={Store}
          title="Todavía no registraste ningún bar."
          description="Sumá tu local al programa de fidelización."
          action={
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate("/bar/registro")}
            >
              <Plus size={20} />
              REGISTRAR MI BAR
            </Button>
          }
        />
      )}

      {!isLoading && bars && bars.length > 0 && (
        <div className="flex flex-col gap-4 flex-1">
          <div className="flex flex-col gap-3">
            {bars.map((bar) => (
              <BarCard key={bar.id} bar={bar} />
            ))}
          </div>

          <div className="mt-auto pt-6 pb-4">
            <Button
              variant="surface"
              size="lg"
              fullWidth
              onClick={() => navigate("/bar/registro")}
            >
              <Plus size={20} />
              REGISTRAR OTRO BAR
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
