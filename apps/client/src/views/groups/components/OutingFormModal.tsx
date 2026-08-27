import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { getActiveBars } from "@/API/BarAPI";
import { createOuting, updateOuting } from "@/API/OutingAPI";
import { toastApiError } from "@/utils/apiError";
import {
  OUTING_MAX_DAYS_AHEAD,
  OUTING_NOTE_MAX_LENGTH,
  datetimeLocalToIso,
  getOutingDateTimeBounds,
  isoToDatetimeLocal,
} from "@/types/outing";
import type { Outing } from "@/types/outing";
import type { GroupMember } from "@/types/group";

interface OutingFormValues {
  barId: string;
  scheduledFor: string;
  note: string;
}

interface OutingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMember[];
  outing: Outing | null;
  /** LB-76: bar pre-seleccionado al abrir el modal desde la ficha de un bar
   * (`BarDetailView` → `GroupPickerModal` → `GroupDetailView`), vía `state`
   * de navegación. Solo se usa para el `reset()` inicial en modo creación
   * (`!outing`) — en modo edición siempre prevalece el bar de la salida. */
  preselectedBarId?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDatetimeLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;

export default function OutingFormModal({
  isOpen,
  onClose,
  groupId,
  members,
  outing,
  preselectedBarId,
}: OutingFormModalProps) {
  const queryClient = useQueryClient();
  const isEditMode = !!outing;
  const leader = members.find((m) => m.role === "LEADER");

  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [conflictOutingId, setConflictOutingId] = useState<string | null>(null);

  const { min, max } = getOutingDateTimeBounds();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<OutingFormValues>({
    mode: "onChange",
    defaultValues: { barId: "", scheduledFor: "", note: "" },
  });

  const noteValue = watch("note") ?? "";

  const { data: bars, isLoading: barsLoading } = useQuery({
    queryKey: ["bars", "active"],
    queryFn: getActiveBars,
    enabled: isOpen,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!isOpen) return;

    if (outing) {
      reset({
        barId: outing.bar._id,
        scheduledFor: isoToDatetimeLocal(outing.scheduledFor),
        note: outing.note ?? "",
      });
      setSelectedInvitees(outing.invitees);
    } else {
      reset({ barId: preselectedBarId ?? "", scheduledFor: "", note: "" });
      setSelectedInvitees(members.map((m) => m.id));
    }
    setConflictOutingId(null);
  }, [isOpen, outing, members, reset, preselectedBarId]);

  const toggleInvitee = (memberId: string) => {
    if (leader && memberId === leader.id) return; // leader is a mandatory invitee
    setSelectedInvitees((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const mutation = useMutation({
    mutationFn: async (values: OutingFormValues) => {
      const payload = {
        barId: values.barId,
        scheduledFor: datetimeLocalToIso(values.scheduledFor),
        note: values.note?.trim() ? values.note.trim() : undefined,
        inviteeIds: selectedInvitees,
      };
      if (isEditMode && outing) {
        return updateOuting(groupId, outing._id, payload);
      }
      return createOuting(groupId, payload);
    },
    onSuccess: () => {
      toast.success(isEditMode ? "Salida actualizada" : "Salida creada");
      queryClient.invalidateQueries({ queryKey: ["outings", "active", groupId] });
      onClose();
    },
    onError: (error: unknown) => {
      const apiError = error as { status?: number; message?: string; existingOutingId?: string };
      if (apiError?.status === 409) {
        setConflictOutingId(apiError.existingOutingId ?? null);
        toast.error(apiError.message ?? "El grupo ya tiene una salida activa.");
        return;
      }
      toastApiError(error);
    },
  });

  const onSubmit = (values: OutingFormValues) => {
    setConflictOutingId(null);
    mutation.mutate(values);
  };

  const handleViewExisting = () => {
    queryClient.invalidateQueries({ queryKey: ["outings", "active", groupId] });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay backdrop-blur-sm px-0 sm:px-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outing-modal-title"
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-xl sm:rounded-xl border border-border p-6 shadow-modal"
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              id="outing-modal-title"
              className="text-xl font-display font-bold tracking-tight text-text-primary"
            >
              {isEditMode ? "Editar salida" : "Crear salida"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex justify-center items-center w-8 h-8 rounded-full bg-surface-2 border border-border hover:bg-surface-3 transition-colors"
            >
              <X size={16} className="text-text-secondary" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            {/* Bar select */}
            <div className="flex flex-col gap-2">
              <label htmlFor="outing-bar" className="overline">
                BAR
              </label>
              <select
                id="outing-bar"
                className={`font-ui w-full bg-surface-2 text-text-primary py-4 px-4 rounded-md text-base outline-none transition-all duration-normal ease-default border ${
                  errors.barId ? "border-error" : "border-border"
                } focus:border-lime-border focus:ring-4 focus:ring-lime-glow`}
                disabled={barsLoading || mutation.isPending}
                {...register("barId", { required: "Seleccioná un bar" })}
              >
                <option value="">Seleccioná un bar</option>
                {bars?.map((bar) => (
                  <option key={bar.id} value={bar.id}>
                    {bar.name}
                  </option>
                ))}
              </select>
              {errors.barId && (
                <span className="font-ui text-sm text-error">{errors.barId.message}</span>
              )}
            </div>

            {/* Date/time */}
            <div className="flex flex-col gap-2">
              <label htmlFor="outing-datetime" className="overline">
                FECHA Y HORA
              </label>
              <input
                id="outing-datetime"
                type="datetime-local"
                min={toDatetimeLocal(min)}
                max={toDatetimeLocal(max)}
                className={`font-ui w-full bg-surface-2 text-text-primary py-4 px-4 rounded-md text-base outline-none transition-all duration-normal ease-default border ${
                  errors.scheduledFor ? "border-error" : "border-border"
                } focus:border-lime-border focus:ring-4 focus:ring-lime-glow`}
                disabled={mutation.isPending}
                {...register("scheduledFor", {
                  required: "Seleccioná fecha y hora",
                  validate: (value) => {
                    if (!value) return "Seleccioná fecha y hora";
                    const time = new Date(value).getTime();
                    if (Number.isNaN(time)) return "Fecha inválida";
                    if (time < Date.now() - 60_000) return "La fecha debe ser hoy o en el futuro";
                    if (time > Date.now() + OUTING_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
                      return `La fecha no puede superar los ${OUTING_MAX_DAYS_AHEAD} días desde hoy`;
                    }
                    return true;
                  },
                })}
              />
              {errors.scheduledFor && (
                <span className="font-ui text-sm text-error">{errors.scheduledFor.message}</span>
              )}
            </div>

            {/* Invitees */}
            <div className="flex flex-col gap-2">
              <p className="overline">INVITADOS ({selectedInvitees.length})</p>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {members.map((member) => {
                  const isLeaderMember = member.role === "LEADER";
                  const checked = selectedInvitees.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 bg-surface-2 border border-border rounded-lg px-3 py-2.5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isLeaderMember || mutation.isPending}
                        onChange={() => toggleInvitee(member.id)}
                        aria-label={`Invitar a ${member.name}`}
                        className="w-4 h-4 accent-lime"
                      />
                      <span className="flex-1 text-sm text-text-primary truncate">
                        {member.name}
                      </span>
                      {isLeaderMember && (
                        <span className="text-xs text-text-muted">Líder</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div className="flex flex-col gap-2">
              <label htmlFor="outing-note" className="overline">
                NOTA (OPCIONAL)
              </label>
              <textarea
                id="outing-note"
                rows={3}
                placeholder="Agregá una nota para el grupo..."
                disabled={mutation.isPending}
                className={`font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none resize-none transition-all duration-normal ease-default border ${
                  errors.note ? "border-error" : "border-border"
                } focus:border-lime-border focus:ring-4 focus:ring-lime-glow placeholder:text-text-secondary`}
                {...register("note", {
                  maxLength: {
                    value: OUTING_NOTE_MAX_LENGTH,
                    message: `Máximo ${OUTING_NOTE_MAX_LENGTH} caracteres`,
                  },
                })}
              />
              <div className="flex justify-between items-center">
                {errors.note ? (
                  <span className="font-ui text-sm text-error">{errors.note.message}</span>
                ) : (
                  <span />
                )}
                <span
                  className={`text-xs font-ui ${
                    noteValue.length > OUTING_NOTE_MAX_LENGTH ? "text-error" : "text-text-muted"
                  }`}
                >
                  {noteValue.length}/{OUTING_NOTE_MAX_LENGTH}
                </span>
              </div>
            </div>

            {conflictOutingId !== null && (
              <div className="p-3 bg-error-dim border border-error-border rounded-md text-sm text-error flex flex-col gap-2">
                <span>Este grupo ya tiene una salida activa. Cerrá este formulario para verla.</span>
                <Button type="button" variant="outline" size="sm" onClick={handleViewExisting}>
                  Ver salida activa
                </Button>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <Button
                type="button"
                variant="surface"
                size="md"
                fullWidth
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {isEditMode ? "Guardando..." : "Creando..."}
                  </>
                ) : isEditMode ? (
                  "Guardar cambios"
                ) : (
                  "Crear salida"
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
