import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Trophy,
  Gift,
  Coins,
  CheckCircle2,
  Loader2,
  AlertCircle,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getBarDetail } from "@/API/BarAPI";
import { getAvailableRewardsForBar } from "@/API/RewardAPI";
import { ATTENDANCE_POINTS_DAYS } from "@/types/bar";
import type { Reward } from "@/types/reward";
import GroupPickerModal from "./components/GroupPickerModal";

/**
 * LB-76: ficha de un bar para el cliente (usuario logueado, sin necesidad
 * de ser BarUser de ese bar). Distinta de BarProfileView (edición, dueño) y
 * de BarRewardsView (ABM de recompensas, dueño/cajero). Sin badge
 * "Destacado" ni foto/logo — excluidos explícitamente del MVP del ticket.
 */

function RewardCard({ reward }: { reward: Reward }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 p-4 rounded-lg bg-surface-2 border border-border"
    >
      <h3 className="text-base font-display font-bold tracking-tight leading-tight">
        {reward.name}
      </h3>

      {reward.description && (
        <p className="text-sm text-text-secondary leading-relaxed">{reward.description}</p>
      )}

      <div className="flex items-center gap-1 text-sm text-text-secondary">
        <Coins size={14} />
        {reward.pointsRequired} pts
      </div>
    </motion.div>
  );
}

export default function BarDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);

  const {
    data: bar,
    isLoading: isLoadingBar,
    isError: isBarError,
  } = useQuery({
    queryKey: ["barDetail", id],
    queryFn: () => getBarDetail(id!),
    enabled: !!id,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const {
    data: rewards,
    isLoading: isLoadingRewards,
    isError: isRewardsError,
  } = useQuery({
    queryKey: ["barAvailableRewards", id],
    queryFn: () => getAvailableRewardsForBar(id!),
    enabled: !!id && !!bar,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isBarError) {
      toast.error("No pudimos cargar la información de este bar");
    }
  }, [isBarError]);

  useEffect(() => {
    if (isRewardsError) {
      toast.error("No pudimos cargar las recompensas de este bar");
    }
  }, [isRewardsError]);

  const isLoading = isLoadingBar;

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
        <h1 className="text-2xl font-display font-bold tracking-tight m-0 truncate">
          {bar?.name ?? "Detalle del bar"}
        </h1>
      </header>

      {isLoading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-text-secondary">
          <Loader2 size={32} className="text-lime animate-spin" />
          <p className="text-sm">Cargando bar...</p>
        </div>
      )}

      {!isLoading && (isBarError || !bar) && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 text-center">
          <AlertCircle size={48} className="text-text-muted" />
          <p className="text-error text-base">Error al cargar la información del bar</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Volver
          </Button>
        </div>
      )}

      {!isLoading && !isBarError && bar && (
        <div className="flex flex-col gap-6 flex-1">
          {bar.hasActiveCheckIn && (
            <span className="inline-flex items-center self-start gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border bg-lime/10 text-lime border-lime/20">
              <CheckCircle2 size={16} />
              Estás acá ahora
            </span>
          )}

          {/* Info del bar */}
          <div className="flex flex-col gap-3 p-4 rounded-lg bg-surface-2 border border-border">
            <h2 className="text-lg font-display font-bold tracking-tight leading-tight">
              {bar.name}
            </h2>
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
          </div>

          {/* Puntos por asistencia (solo lectura) */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
              <Trophy size={20} className="text-lime" />
              Puntos por asistencia
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {ATTENDANCE_POINTS_DAYS.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex flex-col gap-1 p-3 rounded-lg bg-surface-2 border border-border"
                >
                  <span className="text-xs text-text-muted uppercase tracking-wide">{label}</span>
                  <span className="text-lg font-display font-bold text-lime">
                    {bar.attendancePointsByDay[key]} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recompensas activas */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
              <Gift size={20} className="text-lime" />
              Recompensas
            </h2>

            {isLoadingRewards && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={24} className="text-lime animate-spin" />
              </div>
            )}

            {!isLoadingRewards && !isRewardsError && rewards && rewards.length === 0 && (
              <p className="text-text-secondary text-sm">
                Este bar todavía no tiene recompensas disponibles.
              </p>
            )}

            {!isLoadingRewards && rewards && rewards.length > 0 && (
              <div className="flex flex-col gap-3">
                {rewards.map((reward) => (
                  <RewardCard key={reward.id} reward={reward} />
                ))}
              </div>
            )}
          </div>

          {/* Crear salida en este bar */}
          <div className="mt-auto pt-6 pb-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setIsGroupPickerOpen(true)}
            >
              <PlusCircle size={20} />
              CREAR SALIDA EN ESTE BAR
            </Button>
          </div>
        </div>
      )}

      {bar && (
        <GroupPickerModal
          isOpen={isGroupPickerOpen}
          onClose={() => setIsGroupPickerOpen(false)}
          barId={bar.id}
        />
      )}
    </motion.div>
  );
}
