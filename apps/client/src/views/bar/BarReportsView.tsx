import { useParams, useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { downloadReport } from "@/API/ReportAPI";
import {
  REPORT_FORMAT_OPTIONS,
  REPORT_KIND_OPTIONS,
  reportFormSchema,
  type ReportFormData,
  type ReportQuery,
} from "@/types/reports";
import { toastApiError } from "@/utils/apiError";

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

function toQuery(data: ReportFormData): ReportQuery {
  return {
    kind: data.kind,
    format: data.format,
    from: `${data.from}T00:00:00.000Z`,
    to: `${data.to}T23:59:59.999Z`,
  };
}

/**
 * Reportes exportables del bar (LB-78, OWNER). Selector de tipo/formato/rango.
 * Rango < 30 días → descarga el archivo (blob); rango >= 30 días → el server
 * responde 202 y lo manda por email (toast informativo).
 */
export default function BarReportsView() {
  const { barId } = useParams<{ barId: string }>();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportFormData>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: { kind: "consumptions", format: "csv", from: "", to: "" },
  });

  const mutation = useMutation({
    mutationFn: (query: ReportQuery) => downloadReport(barId!, query),
    onSuccess: (result) => {
      if (result.mode === "file") {
        triggerDownload(result.blob, result.fileName);
        toast.success("Reporte descargado");
      } else {
        toast.success(result.message);
      }
    },
    onError: toastApiError,
  });

  const onSubmit = (data: ReportFormData) => {
    if (!barId) return;
    mutation.mutate(toQuery(data));
  };

  return (
    <main className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] gap-6">
      <header className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">Reportes del bar</h1>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4 p-4 rounded-lg bg-surface-2 border border-border"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="report-kind" className="overline">TIPO DE REPORTE</label>
          <select
            id="report-kind"
            disabled={mutation.isPending}
            className="font-ui w-full bg-surface text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            {...register("kind")}
          >
            {REPORT_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="report-format" className="overline">FORMATO</label>
          <select
            id="report-format"
            disabled={mutation.isPending}
            className="font-ui w-full bg-surface text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
            {...register("format")}
          >
            {REPORT_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="report-from" className="overline">DESDE</label>
            <input
              id="report-from"
              type="date"
              disabled={mutation.isPending}
              className="font-ui w-full bg-surface text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
              {...register("from")}
            />
            {errors.from && <span className="font-ui text-sm text-error">{errors.from.message}</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="report-to" className="overline">HASTA</label>
            <input
              id="report-to"
              type="date"
              disabled={mutation.isPending}
              className="font-ui w-full bg-surface text-text-primary py-3 px-4 rounded-md text-base outline-none border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow"
              {...register("to")}
            />
            {errors.to && <span className="font-ui text-sm text-error">{errors.to.message}</span>}
          </div>
        </div>

        <p className="text-xs text-text-secondary m-0">
          Rangos de 30 días o más se envían por email al dueño (no hay descarga
          inmediata). El rango máximo por reporte es de 3 meses.
        </p>

        <Button type="submit" variant="primary" size="md" fullWidth disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <FileBarChart size={18} />
          )}
          EXPORTAR REPORTE
        </Button>
      </form>
    </main>
  );
}
