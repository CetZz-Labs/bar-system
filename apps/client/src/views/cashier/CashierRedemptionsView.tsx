import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2, Gift, Loader2, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { lookupRedemption, validateRedemption } from "@/API/CashierRedemptionAPI";
import {
  REJECTION_REASON_OPTIONS,
  buildRejectionReason,
  rejectRedemptionFormSchema,
  type CashierRedemptionPreview,
  type RejectRedemptionFormData,
} from "@/types/cashierRedemption";
import { toastApiError } from "@/utils/apiError";

const defaultRejectValues: RejectRedemptionFormData = {
  reasonOption: "Sin stock físico",
  otherText: "",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Modal de rechazo con motivo (predefinido + "Otro" con texto libre).
 * Componente local (no se extiende `@/components/ui/Modal`, que no admite
 * contenido de formulario — mismo criterio ya documentado en
 * progress/implementers/impl_LB-67.md #7 para BarRewardsView).
 */
function RejectRedemptionModal({
  isOpen,
  onClose,
  onSubmit,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<RejectRedemptionFormData>({
    resolver: zodResolver(rejectRedemptionFormSchema),
    defaultValues: defaultRejectValues,
  });

  const reasonOption = watch("reasonOption");

  useEffect(() => {
    if (isOpen) reset(defaultRejectValues);
  }, [isOpen, reset]);

  const submit = (data: RejectRedemptionFormData) => onSubmit(buildRejectionReason(data));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
        >
          <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
          <motion.form
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onSubmit={handleSubmit(submit)}
            className="relative w-full max-w-sm bg-surface rounded-xl border border-border p-6 shadow-modal flex flex-col gap-4"
          >
            <h2 id="reject-modal-title" className="text-xl font-display font-bold tracking-tight text-text-primary m-0">
              Rechazar canje
            </h2>

            <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
              <legend className="overline mb-1">Motivo</legend>
              {REJECTION_REASON_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-text-primary select-none">
                  <input
                    type="radio"
                    value={option}
                    disabled={isPending}
                    {...register("reasonOption")}
                    className="w-4 h-4 accent-lime"
                  />
                  {option}
                </label>
              ))}
              {errors.reasonOption && (
                <span className="font-ui text-sm text-error">{errors.reasonOption.message}</span>
              )}
            </fieldset>

            {reasonOption === "Otro" && (
              <Input
                label="CONTANOS QUÉ PASÓ"
                aria-label="Contanos qué pasó"
                type="text"
                placeholder="Ej: el líder canceló la salida"
                disabled={isPending}
                error={errors.otherText?.message}
                {...register("otherText")}
              />
            )}

            <div className="flex gap-3 mt-2">
              <Button type="button" variant="surface" size="md" fullWidth onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" size="md" fullWidth disabled={isPending}>
                {isPending ? <Loader2 size={18} className="animate-spin" /> : "Rechazar"}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RedemptionPreviewCard({ preview }: { preview: CashierRedemptionPreview }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Gift size={20} className="text-lime" />
        <h3 className="text-lg font-display font-bold m-0">{preview.rewardName}</h3>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm m-0">
        <dt className="text-text-secondary">Grupo</dt>
        <dd className="text-text-primary m-0">{preview.group.name}</dd>
        <dt className="text-text-secondary">Líder</dt>
        <dd className="text-text-primary m-0">{preview.leader.name}</dd>
        <dt className="text-text-secondary">Puntos</dt>
        <dd className="text-text-primary m-0">{preview.pointsRequired} pts</dd>
        <dt className="text-text-secondary">Generado</dt>
        <dd className="text-text-primary m-0">{formatTime(preview.createdAt)}</dd>
      </dl>
    </div>
  );
}

export default function CashierRedemptionsView() {
  const { barId } = useParams<{ barId: string }>();
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<CashierRedemptionPreview | null>(null);
  const [deliverModalOpen, setDeliverModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);

  const stopScanner = () => {
    if (scanTimer.current) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const lookupMutation = useMutation({
    mutationFn: (tokenOrCode: string) => lookupRedemption(tokenOrCode),
    onSuccess: (data) => {
      if (!data) return;
      setPreview(data);
    },
    onError: toastApiError,
  });

  const validateMutation = useMutation({
    mutationFn: (input: { action: "deliver" | "reject"; reason?: string }) =>
      validateRedemption(query.trim(), input.action, input.reason),
    onSuccess: (data, variables) => {
      if (!data) return;
      setDeliverModalOpen(false);
      setRejectModalOpen(false);
      setPreview(null);
      setQuery("");
      toast.success(variables.action === "deliver" ? "Canje entregado" : "Canje rechazado");
    },
    onError: toastApiError,
  });

  const startScanner = async () => {
    setCameraError(null);
    if (!("BarcodeDetector" in window)) {
      setCameraError("Este navegador no soporta lectura de QR. Usá el código manual del canje.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // @ts-expect-error BarcodeDetector is not in all TS libs
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

      scanTimer.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes?.[0]?.rawValue as string | undefined;
          if (raw) {
            setQuery(raw);
            stopScanner();
            lookupMutation.mutate(raw);
          }
        } catch {
          // frame skip
        }
      }, 400);
    } catch {
      setCameraError("No hay permiso de cámara. Usá el código manual del canje.");
      stopScanner();
    }
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setPreview(null);
    lookupMutation.mutate(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5 max-w-xl mx-auto pb-nav pt-5 px-4"
    >
      <div className="flex items-center gap-3">
        <Link
          to={`/bar/${barId}/cajero`}
          aria-label="Volver al panel"
          className="flex justify-center items-center w-9 h-9 rounded-full bg-surface-2 border border-border"
        >
          <ArrowLeft size={18} className="text-text-secondary" />
        </Link>
        <div>
          <h2 className="text-xl font-display font-bold m-0">Validar canje</h2>
          <p className="text-sm text-text-secondary m-0 mt-1">Escaneá el QR o ingresá el código de 6 dígitos.</p>
        </div>
      </div>

      <form onSubmit={onSearchSubmit} className="flex flex-col gap-3">
        <Input
          label="Código de canje"
          aria-label="Código de canje"
          icon={<Search size={18} />}
          placeholder="Código de 6 dígitos o QR"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex gap-2">
          {!scanning ? (
            <Button variant="outline" size="sm" type="button" onClick={startScanner}>
              <Camera size={16} />
              Escanear QR
            </Button>
          ) : (
            <Button variant="danger" size="sm" type="button" onClick={stopScanner}>
              Detener cámara
            </Button>
          )}
          <Button variant="primary" size="sm" type="submit" disabled={lookupMutation.isPending || !query.trim()}>
            {lookupMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Buscar"}
          </Button>
        </div>
      </form>

      {cameraError && (
        <p className="text-sm text-error m-0" role="alert">
          {cameraError}
        </p>
      )}

      {scanning && (
        <div className="rounded-md overflow-hidden border border-border bg-black aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        </div>
      )}

      {lookupMutation.isPending && (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Loader2 className="animate-spin" size={16} />
          Buscando...
        </div>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <RedemptionPreviewCard preview={preview} />
          <div className="flex gap-3">
            <Button
              variant="danger"
              size="lg"
              fullWidth
              type="button"
              onClick={() => setRejectModalOpen(true)}
              disabled={validateMutation.isPending}
            >
              <XCircle size={18} />
              Rechazar
            </Button>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              type="button"
              onClick={() => setDeliverModalOpen(true)}
              disabled={validateMutation.isPending}
            >
              <CheckCircle2 size={18} />
              Entregar
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={deliverModalOpen}
        onClose={() => setDeliverModalOpen(false)}
        onConfirm={() => validateMutation.mutate({ action: "deliver" })}
        title="Confirmar entrega"
        description={`¿Entregaste la recompensa "${preview?.rewardName ?? ""}"? Esta acción no se puede deshacer.`}
        confirmText="Entregar"
        cancelText="Cancelar"
        isPending={validateMutation.isPending}
      />

      <RejectRedemptionModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onSubmit={(reason) => validateMutation.mutate({ action: "reject", reason })}
        isPending={validateMutation.isPending}
      />
    </motion.div>
  );
}
