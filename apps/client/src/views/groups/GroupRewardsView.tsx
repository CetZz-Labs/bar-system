import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, Gift, Coins, MapPinOff, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/utils/cn";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupRewards } from "@/API/RewardAPI";
import { createRedemption, cancelRedemption, getGroupRedemptions } from "@/API/RedemptionAPI";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { FIRST_VISIT_KEYS } from "@/utils/firstVisit";
import { toastApiError } from "@/utils/apiError";
import type { Reward } from "@/types/reward";
import type { Redemption, RedemptionQrResult } from "@/types/redemption";

/**
 * LB-72: recompensas disponibles del grupo en el bar del check-in activo.
 * "Check-in activo" se resuelve acá con `getActiveOuting` (misma llamada
 * que ya usa OutingSection.tsx) en vez de inferirlo de la respuesta de
 * `getGroupRewards`.
 *
 * LB-68: conecta el botón "Canjear" a `POST /api/groups/:groupId/redemptions`,
 * QR + código manual al confirmar, y listado de canjes HELD propios con
 * botón "Cancelar". Saldo por bar en vivo vía WebSocket.
 *
 * LB-90 (polish): adopción del design system (EmptyState / ErrorState /
 * Spinner / IconButton / Card / Badge), estados de error visibles para las
 * queries `group` y `redemptions`, canjes REJECTED / EXPIRED visibles con
 * copy del catálogo, timer local sobre `expiresAt`, y ajustes de a11y.
 */

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function isExpired(iso: string, nowMs: number): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t <= nowMs;
}

function ProgressToNextReward({ balance, nextReward }: { balance: number; nextReward: Reward }) {
  const pct = Math.max(0, Math.min(100, Math.round((balance / nextReward.pointsRequired) * 100)));
  const missing = Math.max(0, nextReward.pointsRequired - balance);

  return (
    <Card padding="md" className="w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-text-primary text-sm font-medium m-0">
          Próxima recompensa: {nextReward.name}
        </p>
        <span className="text-text-secondary text-xs">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-lime rounded-full transition-[width] duration-normal ease-default"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-label={`Progreso hacia ${nextReward.name}`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-text-secondary text-xs mt-2 m-0">
        Te faltan {missing} pts para poder canjearla
      </p>
    </Card>
  );
}

function RewardCard({
  reward,
  balance,
  canRequestRedemption,
  isRedeeming,
  onRedeem,
}: {
  reward: Reward;
  balance: number;
  canRequestRedemption: boolean;
  isRedeeming: boolean;
  onRedeem: (reward: Reward) => void;
}) {
  const canRedeem = balance >= reward.pointsRequired;
  const missing = reward.pointsRequired - balance;
  const buttonDisabled = !canRequestRedemption || !canRedeem || isRedeeming;

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-display font-bold tracking-tight leading-tight">
          {reward.name}
        </h3>
        <Badge variant={canRedeem ? "success" : "neutral"} className="whitespace-nowrap">
          {canRedeem ? "Podés canjear" : `Te faltan ${missing} pts`}
        </Badge>
      </div>

      {reward.description && (
        <p className="text-sm text-text-secondary leading-relaxed">{reward.description}</p>
      )}

      <div className="flex items-center gap-1 text-sm text-text-secondary">
        <Coins size={14} />
        {reward.pointsRequired} pts
      </div>

      {canRequestRedemption && (
        <Button
          variant="primary"
          size="sm"
          className={cn("mt-2", buttonDisabled && "opacity-60 cursor-not-allowed")}
          disabled={buttonDisabled}
          aria-busy={isRedeeming || undefined}
          onClick={() => onRedeem(reward)}
        >
          {isRedeeming ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              <span className="sr-only">Canjeando</span>
            </>
          ) : (
            "Canjear"
          )}
        </Button>
      )}
    </Card>
  );
}

function RedemptionQrResultCard({
  result,
  onDismiss,
}: {
  result: RedemptionQrResult;
  onDismiss: () => void;
}) {
  return (
    <Card
      padding="lg"
      className="border-lime-border flex flex-col items-center gap-4 text-center"
    >
      <p className="overline m-0">Mostrale esto al cajero</p>
      <img src={result.qrData} alt="QR de canje" className="w-48 h-48 rounded-md bg-white p-2" />
      <div>
        <p className="text-text-secondary text-sm m-0 mb-1">Código manual</p>
        <p className="font-display font-bold text-3xl tracking-[0.3em] m-0">{result.manualCode}</p>
      </div>
      <p className="text-text-secondary text-sm m-0">
        {result.rewardName} · vence {formatTime(result.expiresAt)}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
        Listo
      </Button>
    </Card>
  );
}

function ClosedRedemptionCard({
  redemption,
  displayStatus,
}: {
  redemption: Redemption;
  displayStatus: "REJECTED" | "EXPIRED";
}) {
  const isRejected = displayStatus === "REJECTED";
  return (
    <Card padding="none" className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-text-secondary font-medium m-0 truncate">{redemption.rewardName}</p>
        <p className="text-text-secondary text-xs m-0">
          {isRejected
            ? "Este canje fue rechazado."
            : "Este QR venció. Generá uno nuevo."}
        </p>
      </div>
      <Badge variant={isRejected ? "error" : "neutral"}>
        {isRejected ? "Rechazado" : "Vencido"}
      </Badge>
    </Card>
  );
}

export default function GroupRewardsView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redemptionResult, setRedemptionResult] = useState<RedemptionQrResult | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const backToGroup = () => navigate(slug ? `/groups/${slug}` : "/groups");

  const {
    data: group,
    isLoading: isLoadingGroup,
    isError: isGroupError,
    refetch: refetchGroup,
  } = useQuery({
    queryKey: ["group", slug],
    queryFn: () => getGroupBySlug(slug!),
    enabled: !!slug,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const groupId = group?.id;
  const canManageRedemptions =
    group?.currentUserRole === "LEADER" || group?.currentUserRole === "CO_LEADER";

  const { data: activeOuting, isLoading: isLoadingOuting } = useQuery({
    queryKey: ["outings", "active", groupId],
    queryFn: () => getActiveOuting(groupId!),
    enabled: !!groupId,
    refetchOnWindowFocus: false,
  });

  const hasCheckIn = activeOuting?.status === "ACTIVE";

  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
    isError: isRewardsError,
    refetch: refetchRewards,
  } = useQuery({
    queryKey: ["groupRewards", groupId],
    queryFn: () => getGroupRewards(groupId!),
    enabled: !!groupId && hasCheckIn,
    refetchOnWindowFocus: false,
  });

  const redemptionsQuery = useQuery({
    queryKey: ["redemptions", groupId],
    queryFn: () => getGroupRedemptions(groupId!),
    enabled: !!groupId && canManageRedemptions,
    refetchOnWindowFocus: false,
    // LB-90: refresco acotado para que un HELD que vence server-side pase a
    // EXPIRED sin que el usuario tenga que recargar.
    refetchInterval: canManageRedemptions ? 60_000 : false,
  });

  const onAvailablePoints = useCallback(
    (payload: { groupId: string; barId: string; availablePoints: number }) => {
      if (activeOuting?.bar._id && payload.barId === activeOuting.bar._id) {
        setLiveBalance(payload.availablePoints);
      }
    },
    [activeOuting]
  );

  const onResync = useCallback(() => {
    void redemptionsQuery.refetch();
    void refetchRewards();
  }, [redemptionsQuery, refetchRewards]);

  // Saldo global (points_balance_updated) no aplica al header por-bar; se ignora.
  useGroupPointsSocket(groupId, () => {}, onAvailablePoints, undefined, onResync);

  // LB-90: timer local para que un canje HELD cuyo `expiresAt` ya pasó
  // transicione visiblemente a "vencido" sin esperar un refetch.
  useEffect(() => {
    if (!canManageRedemptions) return;
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [canManageRedemptions]);

  const createRedemptionMutation = useMutation({
    mutationFn: (rewardId: string) => createRedemption(groupId!, rewardId),
    onSuccess: (data) => {
      if (!data) return;
      setRedemptionResult(data);
      setSelectedReward(null);
      setLiveBalance(data.availablePoints);
      toast.success("Canje generado, mostrale el QR o el código al cajero");
      queryClient.invalidateQueries({ queryKey: ["redemptions", groupId] });
    },
    onError: (error: unknown) => {
      toastApiError(error);
      setSelectedReward(null);
    },
  });

  const cancelRedemptionMutation = useMutation({
    mutationFn: (redemptionId: string) => cancelRedemption(groupId!, redemptionId),
    onSuccess: () => {
      toast.success("Canje cancelado");
      queryClient.invalidateQueries({ queryKey: ["redemptions", groupId] });
    },
    onError: (error: unknown) => toastApiError(error),
  });

  const isLoading =
    isLoadingGroup || isLoadingOuting || (hasCheckIn && isLoadingRewards);
  const balance = liveBalance ?? rewardsData?.balance ?? 0;
  const rewards = rewardsData?.rewards ?? [];
  const nextReward = rewards.find((r) => r.pointsRequired > balance);

  const allRedemptions = redemptionsQuery.data ?? [];
  const pendingRedemptions = allRedemptions.filter(
    (r) => r.status === "HELD" && !isExpired(r.expiresAt, nowTick)
  );
  const closedRedemptions = allRedemptions
    .filter(
      (r) =>
        r.status === "REJECTED" ||
        r.status === "EXPIRED" ||
        (r.status === "HELD" && isExpired(r.expiresAt, nowTick))
    )
    .slice(0, 5);

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] max-w-sm mx-auto w-full"
    >
      <header className="flex items-center gap-4 mb-6 relative">
        <IconButton
          aria-label="Volver"
          onClick={() => navigate(slug ? `/groups/${slug}` : "/groups")}
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </IconButton>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">Recompensas</h1>
        <CoachMark
          storageKey={FIRST_VISIT_KEYS.coachRewards}
          title="Canjeá puntos"
          body="Con check-in activo podés canjear recompensas del bar. El saldo se actualiza en vivo."
          placement="bottom"
          className="left-12"
        />
      </header>

      {isGroupError && (
        <ErrorState
          title="No pudimos cargar el grupo."
          description="Revisá tu conexión e intentá de nuevo."
          onRetry={() => refetchGroup()}
          onBack={backToGroup}
        />
      )}

      {!isGroupError && isLoading && (
        <Spinner center size="lg" label="Cargando recompensas" />
      )}

      {!isGroupError && !isLoading && !hasCheckIn && (
        <EmptyState
          icon={MapPinOff}
          title="Necesitás un check-in activo"
          description="Hacé check-in en un bar con tu grupo para ver y canjear sus recompensas."
          action={
            <Button variant="outline" onClick={backToGroup}>
              Volver al grupo
            </Button>
          }
        />
      )}

      {!isGroupError && !isLoading && hasCheckIn && isRewardsError && (
        <ErrorState
          title="No pudimos cargar las recompensas."
          description="Revisá tu conexión e intentá de nuevo."
          onRetry={() => refetchRewards()}
          onBack={() => navigate(-1)}
        />
      )}

      {!isGroupError && !isLoading && hasCheckIn && !isRewardsError && (
        <div className="flex flex-col gap-4">
          {redemptionResult && (
            <RedemptionQrResultCard
              result={redemptionResult}
              onDismiss={() => setRedemptionResult(null)}
            />
          )}

          <Card padding="md" className="w-full">
            <p className="text-text-primary text-base font-medium m-0">
              Tenés <span className="text-lime font-bold">{balance} pts</span> en{" "}
              {activeOuting?.bar.name}
            </p>
          </Card>

          {nextReward && <ProgressToNextReward balance={balance} nextReward={nextReward} />}

          {rewards.length === 0 && (
            <EmptyState
              icon={Gift}
              title="Todavía no hay recompensas en este bar."
            />
          )}

          {rewards.length > 0 && (
            <div className="flex flex-col gap-3">
              {rewards.map((reward) => (
                <RewardCard
                  key={reward.id}
                  reward={reward}
                  balance={balance}
                  canRequestRedemption={canManageRedemptions}
                  isRedeeming={
                    createRedemptionMutation.isPending && selectedReward?.id === reward.id
                  }
                  onRedeem={setSelectedReward}
                />
              ))}
            </div>
          )}

          {canManageRedemptions && redemptionsQuery.isError && (
            <ErrorState
              title="No pudimos cargar tus canjes."
              onRetry={() => redemptionsQuery.refetch()}
              className="py-6"
            />
          )}

          {canManageRedemptions && pendingRedemptions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="overline m-0">Canjes pendientes</p>
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {pendingRedemptions.map((redemption) => (
                  <li key={redemption.id}>
                    <Card
                      padding="none"
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-text-primary font-medium m-0 truncate">
                          {redemption.rewardName}
                        </p>
                        <p className="text-text-secondary text-xs m-0">
                          Código {redemption.manualCode} · vence {formatTime(redemption.expiresAt)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Cancelar canje de ${redemption.rewardName}`}
                        onClick={() => cancelRedemptionMutation.mutate(redemption.id)}
                        disabled={cancelRedemptionMutation.isPending}
                      >
                        <XCircle size={14} aria-hidden="true" />
                        Cancelar
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canManageRedemptions && closedRedemptions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="overline m-0">Canjes recientes</p>
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {closedRedemptions.map((redemption) => (
                  <li key={redemption.id}>
                    <ClosedRedemptionCard
                      redemption={redemption}
                      displayStatus={redemption.status === "REJECTED" ? "REJECTED" : "EXPIRED"}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!selectedReward}
        onClose={() => setSelectedReward(null)}
        onConfirm={() => selectedReward && createRedemptionMutation.mutate(selectedReward.id)}
        title="Confirmar canje"
        description={
          selectedReward
            ? `Vas a canjear ${selectedReward.name} por ${selectedReward.pointsRequired} pts, quedan ${
                balance - selectedReward.pointsRequired
              } pts`
            : undefined
        }
        confirmText="Canjear"
        cancelText="Cancelar"
        isPending={createRedemptionMutation.isPending}
      />
    </motion.div>
  );
}
