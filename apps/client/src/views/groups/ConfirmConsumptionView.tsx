import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, Camera, Loader2, QrCode, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  acceptConsumption,
  lookupConsumption,
  rejectConsumption,
} from "@/API/ConsumptionAPI";
import { toastApiError } from "@/utils/apiError";
import type { ConsumptionLookupResult } from "@/types/consumption";
import { useGroupPointsSocket } from "@/hooks/useGroupPointsSocket";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default function ConfirmConsumptionView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ConsumptionLookupResult | null>(null);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);

  const onBalance = useCallback((balance: number) => {
    setPointsBalance(balance);
  }, []);

  useGroupPointsSocket(preview?.groupId, onBalance);

  const lookupMutation = useMutation({
    mutationFn: (tokenOrCode: string) => lookupConsumption(tokenOrCode),
    onSuccess: (data) => {
      if (data) {
        setPreview(data);
        toast.success("Consumo encontrado");
      }
    },
    onError: toastApiError,
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => acceptConsumption(id),
    onSuccess: (data) => {
      if (!data) return;
      setPointsBalance(data.pointsBalance);
      toast.success(
        data.alreadyConfirmed
          ? "Este consumo ya estaba confirmado"
          : `Confirmado · +${data.pointsAwarded} pts`
      );
      setPreview(null);
      setCode("");
    },
    onError: toastApiError,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectConsumption(id),
    onSuccess: (data) => {
      if (!data) return;
      if (data.status === "DISPUTED") {
        toast.error("Consumo en disputa por rechazos repetidos, avisá al bar");
      } else {
        toast.message("Consumo rechazado. El cajero puede regenerar el código.");
      }
      setPreview(null);
      setCode("");
    },
    onError: toastApiError,
  });

  const stopScanner = () => {
    if (scanTimer.current) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => stopScanner(), []);

  const startScanner = async () => {
    setCameraError(null);
    if (!("BarcodeDetector" in window)) {
      setCameraError(
        "Este navegador no soporta lectura de QR. Usá el código de 6 dígitos."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // @ts-expect-error BarcodeDetector no tipado en todos los lib DOM
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

      scanTimer.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes?.[0]?.rawValue as string | undefined;
          if (raw) {
            stopScanner();
            setCode(raw);
            lookupMutation.mutate(raw);
          }
        } catch {
          // skip frame
        }
      }, 400);
    } catch {
      setCameraError(
        "No hay permiso de cámara. Usá el código de 6 dígitos como alternativa."
      );
      stopScanner();
    }
  };

  const onSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    lookupMutation.mutate(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] max-w-xl mx-auto w-full"
    >
      <header className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          aria-label="Volver"
          onClick={() => navigate(slug ? `/groups/${slug}` : "/groups")}
        >
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-xl font-display font-bold m-0">Confirmar consumo</h1>
          <p className="text-sm text-text-secondary m-0">
            Escaneá el QR del cajero o tipeá el código de 6 dígitos.
          </p>
        </div>
      </header>

      {pointsBalance !== null && (
        <p className="text-sm text-lime mb-4 m-0">Saldo del grupo: {pointsBalance} pts</p>
      )}

      {!preview && (
        <>
          <form onSubmit={onSubmitCode} className="flex flex-col gap-3 mb-4">
            <Input
              label="Código o token QR"
              icon={<QrCode size={18} />}
              placeholder="6 dígitos o pegá el token del QR"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={lookupMutation.isPending || !code.trim()}
            >
              {lookupMutation.isPending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Search size={18} />
                  Buscar consumo
                </>
              )}
            </Button>
          </form>

          <div className="flex gap-2 mb-3">
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
          </div>

          {cameraError && (
            <p className="text-sm text-error" role="alert">
              {cameraError}
            </p>
          )}

          {scanning && (
            <div className="rounded-md overflow-hidden border border-border bg-black aspect-video mb-4">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            </div>
          )}
        </>
      )}

      {preview && (
        <div className="rounded-md border border-border bg-surface-2 p-5 flex flex-col gap-3">
          <div>
            <p className="overline m-0">Bar</p>
            <p className="text-lg font-display font-bold m-0">{preview.bar.name}</p>
          </div>
          <div>
            <p className="overline m-0">Monto</p>
            <p className="text-2xl font-bold m-0">{currency.format(preview.amount)}</p>
            <p className="text-sm text-text-secondary m-0">
              ≈ {Math.floor(preview.amount / 1000)} pts si aceptás
            </p>
          </div>
          <div>
            <p className="overline m-0">Hora</p>
            <p className="m-0">
              {new Date(preview.createdAt).toLocaleString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              })}
            </p>
          </div>
          {preview.breakdown && preview.breakdown.length > 0 && (
            <div>
              <p className="overline m-0 mb-1">Categorías</p>
              <ul className="list-none p-0 m-0 flex flex-col gap-1">
                {preview.breakdown.map((item, i) => (
                  <li key={`${item.category}-${i}`} className="text-sm">
                    {item.category} × {item.quantity} — {currency.format(item.subtotal)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <Button
              type="button"
              variant="primary"
              fullWidth
              disabled={acceptMutation.isPending || rejectMutation.isPending}
              onClick={() => acceptMutation.mutate(preview.consumptionId)}
            >
              {acceptMutation.isPending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                "Aceptar y acreditar puntos"
              )}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              disabled={acceptMutation.isPending || rejectMutation.isPending}
              onClick={() => rejectMutation.mutate(preview.consumptionId)}
            >
              Rechazar
            </Button>
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => {
                setPreview(null);
                setCode("");
              }}
            >
              Buscar otro
            </Button>
          </div>
        </div>
      )}

      {slug && (
        <p className="text-sm text-text-secondary mt-6">
          <Link to={`/groups/${slug}`} className="text-lime">
            Volver al grupo
          </Link>
        </p>
      )}
    </motion.div>
  );
}
