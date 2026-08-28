import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Trophy,
  Gift,
  Coins,
  CheckCircle2,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getBarDetail } from "@/API/BarAPI";
import { getAvailableRewardsForBar } from "@/API/RewardAPI";
import { ATTENDANCE_POINTS_DAYS } from "@/types/bar";
import type { Reward } from "@/types/reward";
import GroupPickerModal from "./components/GroupPickerModal";

/**
 * LB-76: ficha de un bar para el cliente (usuario logueado, sin necesidad
 * de ser BarUser de ese bar). Distinta de BarProfileView (edición, dueño) y
 * de BarRewardsView (ABM de recompensas, dueño/cajero).
 *
 * LB-90 (polish): adopción del design system (Card / Badge / Spinner /
 * EmptyState / ErrorState / IconButton). El error de `barDetail` deja de
 * duplicarse (antes toast + bloque inline); ahora es solo un ErrorState
 * inline con "Reintentar". El error de la lista de recompensas deja de ser
 * un hueco silencioso y muestra un ErrorState acotado.
 */

function RewardCard({ reward }: { reward: Reward }) {
  return (
    <Card padding="md" className="flex flex-col gap-2">
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
    </Card>
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
    refetch: refetchBar,
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
    refetch: refetchRewards,
  } = useQuery({
    queryKey: ["barAvailableRewards", id],
    queryFn: () => getAvailableRewardsForBar(id!),
    enabled: !!id && !!bar,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isLoading = isLoadingBar;

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <IconButton aria-label="Volver" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} className="text-text-secondary" />
        </IconButton>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0 truncate">
          {bar?.name ?? "Detalle del bar"}
        </h1>
      </header>

      {isLoading && <Spinner center size="lg" label="Cargando bar" />}

      {!isLoading && (isBarError || !bar) && (
        <ErrorState
          title="No pudimos cargar la información del bar."
          description="Revisá tu conexión e intentá de nuevo."
          onRetry={() => refetchBar()}
          onBack={() => navigate(-1)}
        />
      )}

      {!isLoading && !isBarError && bar && (
        <div className="flex flex-col gap-6 flex-1">
          {bar.hasActiveCheckIn && (
            <Badge
              variant="success"
              icon={<CheckCircle2 size={16} />}
              className="self-start px-3 py-1.5 text-sm"
            >
              Estás acá ahora
            </Badge>
          )}

          {/* Info del bar */}
          <Card padding="md" className="flex flex-col gap-3">
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
          </Card>

          {/* Puntos por asistencia (solo lectura) */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
              <Trophy size={20} className="text-lime" />
              Puntos por asistencia
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {ATTENDANCE_POINTS_DAYS.map(({ key, label }) => (
                <Card key={key} padding="none" className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-text-secondary uppercase tracking-wide">
                    {label}
                  </span>
                  <span className="text-lg font-display font-bold text-lime">
                    {bar.attendancePointsByDay[key]} pts
                  </span>
                </Card>
              ))}
            </div>
          </div>

          {/* Recompensas activas */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
              <Gift size={20} className="text-lime" />
              Recompensas
            </h2>

            {isLoadingRewards && <Spinner center label="Cargando recompensas" />}

            {!isLoadingRewards && isRewardsError && (
              <ErrorState
                title="No pudimos cargar las recompensas."
                onRetry={() => refetchRewards()}
                className="py-6"
              />
            )}

            {!isLoadingRewards && !isRewardsError && rewards && rewards.length === 0 && (
              <EmptyState icon={Gift} title="Todavía no hay recompensas en este bar." />
            )}

            {!isLoadingRewards && !isRewardsError && rewards && rewards.length > 0 && (
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
