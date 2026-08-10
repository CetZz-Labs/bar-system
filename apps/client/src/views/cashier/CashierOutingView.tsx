import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, Loader2, QrCode, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createConsumption, getPendingConsumptions, regenerateConsumption } from "@/API/ConsumptionAPI";
import { toastApiError } from "@/utils/apiError";
import { UNUSUAL_AMOUNT_THRESHOLD } from "@/types/consumption";
import type { ConsumptionQrResult, PendingConsumption } from "@/types/consumption";
import type { CashierSearchResult } from "@/types/cashier";

interface ConsumptionFormValues {
  amount: string;
}

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function QrResultCard({
  result,
  onRegenerate,
  isRegenerating,
}: {
  result: ConsumptionQrResult;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  return (
    <div className="rounded-md border border-lime-border bg-surface-2 p-5 flex flex-col items-center gap-4 text-center">
      <p className="overline m-0">Mostrale esto al líder</p>
      <img src={result.qrData} alt="QR de confirmación del consumo" className="w-48 h-48 rounded-md bg-white p-2" />
      <div>
        <p className="text-text-secondary text-sm m-0 mb-1">Código manual</p>
        <p className="font-display font-bold text-3xl tracking-[0.3em] m-0">{result.manualCode}</p>
      </div>
      <p className="text-text-secondary text-sm m-0">
        {currencyFormatter.format(result.amount)} · vence {formatTime(result.expiresAt)}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
        {isRegenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        Regenerar código
      </Button>
    </div>
  );
}

export default function CashierOutingView() {
  const { barId, outingId } = useParams<{ barId: string; outingId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const outingInfo = (location.state as { outing?: CashierSearchResult } | null)?.outing;

  const [activeResult, setActiveResult] = useState<ConsumptionQrResult | null>(null);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConsumptionFormValues>({ mode: "onChange", defaultValues: { amount: "" } });

  const pendingQuery = useQuery({
    queryKey: ["consumptions", "pending", outingId],
    queryFn: () => getPendingConsumptions(outingId!),
    enabled: !!outingId,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (amount: number) => createConsumption(outingId!, { amount }),
    onSuccess: (data) => {
      if (!data) return;
      setActiveResult(data);
      reset({ amount: "" });
      toast.success("Consumo registrado, mostrale el QR o el código al líder");
      queryClient.invalidateQueries({ queryKey: ["consumptions", "pending", outingId] });
    },
    onError: toastApiError,
  });

  const regenerateMutation = useMutation({
    mutationFn: (consumptionId: string) => regenerateConsumption(outingId!, consumptionId),
    onSuccess: (data) => {
      if (!data) return;
      setActiveResult(data);
      toast.success("Código regenerado");
      queryClient.invalidateQueries({ queryKey: ["consumptions", "pending", outingId] });
    },
    onError: toastApiError,
    onSettled: () => setRegeneratingId(null),
  });

  const submitAmount = (amount: number) => {
    createMutation.mutate(amount);
  };

  const onSubmit = (values: ConsumptionFormValues) => {
    const amount = Number(values.amount);
    if (amount > UNUSUAL_AMOUNT_THRESHOLD) {
      setPendingAmount(amount);
      return;
    }
    submitAmount(amount);
  };

  const confirmUnusualAmount = () => {
    if (pendingAmount === null) return;
    submitAmount(pendingAmount);
    setPendingAmount(null);
  };

  const handleRegenerate = (consumption: PendingConsumption) => {
    setRegeneratingId(consumption._id);
    regenerateMutation.mutate(consumption._id);
  };

  const pendingConsumptions = pendingQuery.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 max-w-xl mx-auto pb-nav pt-5 px-4"
    >
      <div className="flex items-center gap-3">
        <Link
          to={`/bar/${barId}/cajero/buscar`}
          aria-label="Volver a la búsqueda"
          className="flex justify-center items-center w-9 h-9 rounded-full bg-surface-2 border border-border"
        >
          <ArrowLeft size={18} className="text-text-secondary" />
        </Link>
        <div>
          <h2 className="text-xl font-display font-bold m-0">{outingInfo?.name ?? "Salida en curso"}</h2>
          {outingInfo && (
            <p className="text-sm text-text-secondary m-0 flex items-center gap-1.5 mt-1">
              <Users size={14} />
              {outingInfo.members.length} invitados
            </p>
          )}
        </div>
      </div>

      {activeResult && (
        <QrResultCard
          result={activeResult}
          onRegenerate={() => handleRegenerate({ _id: activeResult.consumptionId } as PendingConsumption)}
          isRegenerating={regenerateMutation.isPending && regeneratingId === activeResult.consumptionId}
        />
      )}

      <div className="rounded-md border border-border bg-surface-2 p-5">
        <h3 className="text-lg font-display font-bold m-0 mb-4">Registrar consumo</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Monto total (ARS)"
            aria-label="Monto total (ARS)"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="12000"
            error={errors.amount?.message}
            disabled={createMutation.isPending}
            {...register("amount", {
              required: "Ingresá el monto consumido",
              validate: (value) => {
                const amount = Number(value);
                if (!Number.isInteger(amount) || amount <= 0) return "El monto debe ser un número entero mayor a 0";
                return true;
              },
            })}
          />
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <QrCode size={18} />
                Generar QR y código
              </>
            )}
          </Button>
        </form>
      </div>

      <div>
        <p className="overline m-0 mb-2">Consumos pendientes de confirmación</p>
        {pendingQuery.isLoading && (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <Loader2 className="animate-spin" size={16} />
            Cargando...
          </div>
        )}
        {!pendingQuery.isLoading && pendingConsumptions.length === 0 && (
          <p className="text-sm text-text-secondary m-0">No hay consumos pendientes en esta salida.</p>
        )}
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {pendingConsumptions.map((consumption) => (
            <li
              key={consumption._id}
              className="rounded-md border border-border bg-surface-2 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-text-primary font-medium m-0">{currencyFormatter.format(consumption.amount)}</p>
                <p className="text-text-secondary text-xs m-0">Vence {formatTime(consumption.expiresAt)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRegenerate(consumption)}
                disabled={regenerateMutation.isPending && regeneratingId === consumption._id}
              >
                {regenerateMutation.isPending && regeneratingId === consumption._id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Ver código"
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        isOpen={pendingAmount !== null}
        onClose={() => setPendingAmount(null)}
        onConfirm={confirmUnusualAmount}
        title="Monto inusual"
        description={`Estás por registrar ${
          pendingAmount !== null ? currencyFormatter.format(pendingAmount) : ""
        }. ¿Confirmás?`}
        confirmText="Confirmar"
        cancelText="Revisar"
        isPending={createMutation.isPending}
      />
    </motion.div>
  );
}
