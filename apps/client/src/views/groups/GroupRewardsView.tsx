import { useCallback, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, Gift, Coins, MapPinOff, Loader2, AlertCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupRewards } from "@/API/RewardAPI";
import { createRedemption, cancelRedemption, getGroupRedemptions } from "@/API/RedemptionAPI";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";
import { toastApiError } from "@/utils/apiError";
import type { Reward } from "@/types/reward";
import type { RedemptionQrResult } from "@/types/redemption";

/**
 * LB-72: recompensas disponibles del grupo en el bar del check-in activo.
 * "Check-in activo" se resuelve acá con `getActiveOuting` (misma llamada
 * que ya usa OutingSection.tsx) en vez de inferirlo de la respuesta de
 * `getGroupRewards` — decisión propia, ver impl_LB-72.md: la respuesta del
 * backend `{ rewards: [], balance: 0 }` es ambigua (también puede
 * significar "hay check-in pero el bar no tiene recompensas activas o el
 * saldo es 0"), así que la señal de "hay o no check-in" se resuelve por una
 * fuente independiente.
 *
 * LB-68 (segunda pasada): conecta el botón "Canjear" (antes deshabilitado,
 * "Próximamente") a `POST /api/groups/:groupId/redemptions`. Modal de
 * confirmación (mismo componente `Modal` que ya usa OutingSection.tsx para
 * "Cancelar salida"), QR + código manual al confirmar (mismo estilo visual
 * que `CashierOutingView.tsx`, sin componente compartido — no existe uno en
 * el repo, ver exp_LB-68.md §8), y listado de canjes HELD propios con botón
 * "Cancelar". El saldo por bar se actualiza en vivo vía WebSocket
 * (`available_points_updated`, ya emitido por el backend de LB-68 desde
 * create/cancel) — no hace falta refrescar manualmente.
 */

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function ProgressToNextReward({ balance, nextReward }: { balance: number; nextReward: Reward }) {
  const pct = Math.max(0, Math.min(100, Math.round((balance / nextReward.pointsRequired) * 100)));
  const missing = Math.max(0, nextReward.pointsRequired - balance);

  return (
    <div className="w-full bg-surface-2 border border-border rounded-xl p-4">
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
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-text-secondary text-xs mt-2 m-0">
        Te faltan {missing} pts para poder canjearla
      </p>
    </div>
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 p-4 rounded-lg bg-surface-2 border border-border"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-display font-bold tracking-tight leading-tight">
          {reward.name}
        </h3>
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border whitespace-nowrap ${
            canRedeem
              ? "bg-lime/10 text-lime border-lime/20"
              : "bg-surface-3 text-text-secondary border-border"
          }`}
        >
          {canRedeem ? "Podés canjear" : `Te faltan ${missing} pts`}
        </span>
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
          className={`mt-2 ${buttonDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
          disabled={buttonDisabled}
          onClick={() => onRedeem(reward)}
        >
          {isRedeeming ? <Loader2 size={14} className="animate-spin" /> : "Canjear"}
        </Button>
      )}
    </motion.div>
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
    <div className="rounded-md border border-lime-border bg-surface-2 p-5 flex flex-col items-center gap-4 text-center">
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
    </div>
  );
}

export default function GroupRewardsView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redemptionResult, setRedemptionResult] = useState<RedemptionQrResult | null>(null);

  const { data: group } = useQuery({
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
  });

  const onBalance = useCallback(() => {
    // El saldo GLOBAL del grupo (points_balance_updated) no es el mismo
    // dato que el saldo por bar que se muestra acá — se ignora acá, solo
    // se usa el evento por-bar (onAvailablePoints) para refrescar el header.
  }, []);

  const onAvailablePoints = useCallback(
    (payload: { groupId: string; barId: string; availablePoints: number }) => {
      if (activeOuting?.bar._id && payload.barId === activeOuting.bar._id) {
        setLiveBalance(payload.availablePoints);
      }
    },
    [activeOuting]
  );

  useGroupPointsSocket(groupId, onBalance, onAvailablePoints);

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

  const isLoading = isLoadingOuting || (hasCheckIn && isLoadingRewards);
  // `liveBalance` solo se setea a partir de un evento de socket
  // (available_points_updated); mientras no llegue ninguno, se muestra el
  // saldo del fetch inicial de getGroupRewards directamente (sin
  // sincronizarlo a un state local vía efecto, para no disparar renders en
  // cascada — ver react-hooks/set-state-in-effect).
  const balance = liveBalance ?? rewardsData?.balance ?? 0;
  const rewards = rewardsData?.rewards ?? [];
  const nextReward = rewards.find((r) => r.pointsRequired > balance);
  const pendingRedemptions = (redemptionsQuery.data ?? []).filter((r) => r.status === "HELD");

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] max-w-sm mx-auto w-full"
    >
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(slug ? `/groups/${slug}` : "/groups")}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Recompensas
        </h1>
      </header>

      {isLoading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Loader2 size={32} className="text-lime animate-spin" />
          <p className="text-text-secondary text-base">Cargando recompensas...</p>
        </div>
      )}

      {!isLoading && !hasCheckIn && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 text-center">
          <MapPinOff size={48} className="text-text-muted" />
          <div>
            <p className="text-text-primary text-lg font-semibold">Sin check-in activo</p>
            <p className="text-text-secondary text-sm mt-1">
              Hacé check-in en un bar para ver sus recompensas
            </p>
          </div>
          {slug && (
            <Link to={`/groups/${slug}`} className="text-lime text-sm">
              Volver al grupo
            </Link>
          )}
        </div>
      )}

      {!isLoading && hasCheckIn && isRewardsError && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 text-center">
          <AlertCircle size={48} className="text-text-muted" />
          <p className="text-error text-base">Error al cargar las recompensas del bar</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Volver
          </Button>
        </div>
      )}

      {!isLoading && hasCheckIn && !isRewardsError && (
        <div className="flex flex-col gap-4">
          {redemptionResult && (
            <RedemptionQrResultCard
              result={redemptionResult}
              onDismiss={() => setRedemptionResult(null)}
            />
          )}

          <div className="w-full bg-surface-2 border border-border rounded-xl p-4">
            <p className="text-text-primary text-base font-medium m-0">
              Tenés <span className="text-lime font-bold">{balance} pts</span> en{" "}
              {activeOuting?.bar.name}
            </p>
          </div>

          {nextReward && <ProgressToNextReward balance={balance} nextReward={nextReward} />}

          {rewards.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center py-8">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-2 border border-border">
                <Gift size={28} className="text-text-secondary" />
              </div>
              <p className="text-text-secondary text-base">
                Este bar todavía no tiene recompensas disponibles.
              </p>
            </div>
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
                    createRedemptionMutation.isPending &&
                    selectedReward?.id === reward.id
                  }
                  onRedeem={setSelectedReward}
                />
              ))}
            </div>
          )}

          {canManageRedemptions && pendingRedemptions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="overline m-0">Canjes pendientes</p>
              <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {pendingRedemptions.map((redemption) => (
                  <li
                    key={redemption.id}
                    className="rounded-md border border-border bg-surface-2 px-4 py-3 flex items-center justify-between gap-3"
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
                      onClick={() => cancelRedemptionMutation.mutate(redemption.id)}
                      disabled={cancelRedemptionMutation.isPending}
                    >
                      <XCircle size={14} />
                      Cancelar
                    </Button>
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
