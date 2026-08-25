import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, LogOut, Loader2, Store, TriangleAlert } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  downloadShiftSummaryCsv,
  downloadShiftSummaryPdf,
  getShiftSummary,
} from "@/API/CashierAPI";
import type { CashierShiftSummary, CashierShiftSummaryResponse } from "@/types/cashier";
import { toastApiError } from "@/utils/apiError";

interface CashierShiftSummaryLocationState {
  summary?: CashierShiftSummary;
}

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const endReasonLabels: Record<string, string> = {
  MANUAL: "Cierre manual",
  KICKED_OUT: "Cierre por inicio en otro dispositivo",
  BAR_CLOSED: "Cierre automático por horario del bar",
};

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
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

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-4">
      <p className="text-text-secondary text-sm m-0">{label}</p>
      <p className="text-text-primary font-display font-bold text-xl m-0 mt-1">{value}</p>
    </div>
  );
}

export default function CashierShiftSummaryView() {
  const { shiftId } = useParams<{ barId: string; shiftId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigationState = location.state as CashierShiftSummaryLocationState | null;
  const immediateSummary = navigationState?.summary;

  const summaryQuery = useQuery<CashierShiftSummaryResponse>({
    queryKey: ["cashier-shift-summary", shiftId],
    queryFn: () => getShiftSummary(shiftId!),
    enabled: !immediateSummary && !!shiftId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (summaryQuery.isError) {
      toastApiError(summaryQuery.error);
    }
  }, [summaryQuery.error, summaryQuery.isError]);

  useEffect(() => {
    if (summaryQuery.isSuccess) {
      toast.success("Resumen cargado");
    }
  }, [summaryQuery.isSuccess]);

  const downloadMutation = useMutation({
    mutationFn: async (format: "pdf" | "csv") => {
      if (!shiftId) throw new Error("No se encontró el turno a descargar");
      const blob = format === "pdf"
        ? await downloadShiftSummaryPdf(shiftId)
        : await downloadShiftSummaryCsv(shiftId);
      return { blob, format };
    },
    onSuccess: ({ blob, format }) => {
      triggerDownload(blob, `resumen-turno-${shiftId}.${format}`);
      toast.success(`Resumen ${format.toUpperCase()} descargado`);
    },
    onError: toastApiError,
  });

  const summary = immediateSummary ?? summaryQuery.data?.summary;
  const shiftResponse = summaryQuery.data;

  const handleExit = () => {
    queryClient.removeQueries({ queryKey: ["cashier-session"] });
    navigate(`/login`, { replace: true });
  };

  if (summaryQuery.isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-bg text-text-secondary">
        <Loader2 size={28} className="animate-spin" />
        <span className="ml-2">Cargando resumen...</span>
      </div>
    );
  }

  if (!summary || !shiftId) {
    return (
      <main className="min-h-[100dvh] bg-bg px-4 py-8 flex flex-col items-center justify-center text-center">
        <TriangleAlert size={32} className="text-error mb-3" />
        <h1 className="text-2xl font-display font-bold">No se pudo cargar el resumen</h1>
        <p className="text-text-secondary mt-2 mb-6">Volvé al acceso del cajero para continuar.</p>
        <Button type="button" variant="outline" onClick={handleExit}>
          <ArrowLeft size={18} />
          Volver al acceso
        </Button>
      </main>
    );
  }

  const pendingOrDisputed = summary.pendingConsumptions + summary.disputedConsumptions > 0;
  const endReason = shiftResponse?.endReason;

  return (
    <main className="min-h-[100dvh] bg-bg px-4 py-6 flex flex-col">
      <header className="flex items-center gap-2 mb-8">
        <div className="flex items-center justify-center p-1 rounded-md bg-lime">
          <Store size={24} className="text-bg" strokeWidth={2.5} />
        </div>
        <h1 className="font-display font-bold text-xl">Resumen de cierre</h1>
      </header>

      <section className="flex-1 max-w-xl w-full mx-auto">
        <div className="rounded-md border border-lime-border bg-surface-2 p-5 mb-5">
          <p className="overline m-0">Turno cerrado</p>
          <p className="text-text-secondary text-sm mt-2 mb-0">
            {endReasonLabels[endReason ?? ""] ?? "Cierre de turno"}
          </p>
          <p className="text-text-secondary text-sm mt-1 mb-0">
            Generado el {formatDate(summary.generatedAt)}
          </p>
        </div>

        {pendingOrDisputed && (
          <div className="rounded-md border border-error-border bg-error-dim p-4 mb-5 flex items-start gap-3" role="alert">
            <TriangleAlert size={20} className="text-error mt-0.5 shrink-0" />
            <p className="text-error text-sm m-0">
              Hay {summary.pendingConsumptions} consumo(s) pendiente(s) y {summary.disputedConsumptions} en disputa. El cierre no se bloqueó; revisalos desde el circuito correspondiente.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-5">
          <SummaryMetric label="Total de consumos" value={summary.totalConsumptions} />
          <SummaryMetric label="Confirmados" value={summary.confirmedConsumptions} />
          <SummaryMetric label="Pendientes" value={summary.pendingConsumptions} />
          <SummaryMetric label="En disputa" value={summary.disputedConsumptions} />
          <SummaryMetric label="Rechazados" value={summary.rejectedConsumptions} />
          <SummaryMetric label="Monto confirmado" value={currencyFormatter.format(summary.totalAmount)} />
          <SummaryMetric label="Puntos otorgados" value={summary.pointsAwarded} />
          <SummaryMetric label="Canjes" value={summary.redemptionsAvailable ? summary.redemptionCount : "No disponible"} />
        </div>

        {!summary.redemptionsAvailable && (
          <p className="text-text-muted text-sm mb-5">
            Los datos de canjes estarán disponibles próximamente.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <p className="overline m-0">Descargar resumen</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadMutation.mutate("pdf")}
              disabled={downloadMutation.isPending}
            >
              <Download size={18} />
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadMutation.mutate("csv")}
              disabled={downloadMutation.isPending}
            >
              <Download size={18} />
              CSV
            </Button>
          </div>
        </div>
      </section>

      <Button type="button" variant="primary" size="lg" fullWidth className="max-w-xl mx-auto mt-8" onClick={handleExit}>
        <LogOut size={20} />
        SALIR Y CERRAR SESIÓN
      </Button>
    </main>
  );
}
