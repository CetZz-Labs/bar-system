import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Store,
  MapPin,
  Phone,
  Clock,
  FileText,
  CheckCircle2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { registerBar } from "@/API/BarAPI";
import {
  createBarSchema,
  type CreateBarFormData,
  type BarScheduleSlot,
  DAY_NAMES,
} from "@/types/bar";
import { toastApiError } from "@/utils/apiError";

const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

const SHORT_DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

function ScheduleSlotItem({
  slot,
  onRemove,
}: {
  slot: BarScheduleSlot;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-surface-2 border border-border">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text-primary">
          {DAY_NAMES[slot.day]}
        </span>
        <span className="text-xs text-text-secondary">
          {slot.open} - {slot.close}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-error-dim text-error transition-colors hover:bg-error/20"
        aria-label="Eliminar horario"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function BarRegisterView() {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValid, setIsValid] = useState(false);

  const [scheduleSlots, setScheduleSlots] = useState<BarScheduleSlot[]>([]);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [newOpen, setNewOpen] = useState("");
  const [newClose, setNewClose] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateBarFormData>({
    mode: "onChange",
    defaultValues: {
      name: "",
      address: {
        street: "",
        number: "",
        neighborhood: "",
        city: "",
      },
      phone: "",
      schedule: [],
      description: "",
    },
  });

  const watchedValues = watch();

  useEffect(() => {
    setValue("schedule", scheduleSlots, { shouldValidate: true });
  }, [scheduleSlots, setValue]);

  useEffect(() => {
    const result = createBarSchema.safeParse(watchedValues);
    setIsValid(result.success);
  }, [watchedValues]);

  const mutation = useMutation({
    mutationFn: registerBar,
    onError: toastApiError,
    onSuccess: () => {
      toast.success("Bar registrado exitosamente");
      setIsSuccess(true);
    },
  });

  const toggleDay = useCallback((day: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  const handleAddSlots = useCallback(() => {
    setScheduleError(null);

    if (selectedDays.size === 0) {
      setScheduleError("Seleccioná al menos un día");
      return;
    }
    if (!newOpen || !newClose) {
      setScheduleError("Seleccioná ambos horarios");
      return;
    }

    const newSlots: BarScheduleSlot[] = Array.from(selectedDays).map((day) => ({
      day,
      open: newOpen,
      close: newClose,
    }));

    setScheduleSlots((prev) => [...prev, ...newSlots]);
    setSelectedDays(new Set());
    setNewOpen("");
    setNewClose("");
  }, [selectedDays, newOpen, newClose]);

  const handleRemoveSlot = useCallback((index: number) => {
    setScheduleSlots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onSubmit = useCallback(
    (formData: CreateBarFormData) => {
      const payload: CreateBarFormData = {
        name: formData.name.trim(),
        address: {
          street: formData.address.street.trim(),
          number: formData.address.number.trim(),
          neighborhood: formData.address.neighborhood?.trim() || undefined,
          city: formData.address.city.trim(),
        },
        phone: formData.phone.trim(),
        schedule: formData.schedule,
        description: formData.description?.trim() || undefined,
      };

      mutation.mutate(payload);
    },
    [mutation]
  );

  const isPending = mutation.isPending;

  if (isSuccess) {
    return (
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
      >
        <div className="flex flex-col items-center justify-center flex-1 gap-6 text-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-lime/10">
            <CheckCircle2 size={40} className="text-lime" />
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-display font-bold tracking-tight">
              Registro enviado
            </h1>
            <p className="text-text-secondary text-base max-w-xs mx-auto">
              Tu bar fue registrado. El equipo de La Banda lo revisará y te
              contactará para activarlo.
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate("/bar/mis-bares")}
          >
            VER MIS BARES
            <ArrowRight size={20} className="text-bg" />
          </Button>
        </div>
      </motion.div>
    );
  }

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
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Registrar mi bar
        </h1>
      </header>

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-5 flex-1"
      >
        <Input
          label="NOMBRE DEL BAR"
          type="text"
          placeholder="Ej: El Bar de Juan"
          icon={<Store size={20} />}
          {...register("name", {
            required: "El nombre es requerido",
            minLength: { value: 3, message: "Mínimo 3 caracteres" },
            maxLength: { value: 60, message: "Máximo 60 caracteres" },
          })}
          error={errors.name?.message}
          disabled={isPending}
        />

        <div className="flex flex-col gap-2">
          <span className="overline">DIRECCIÓN</span>
          <div className="flex flex-col gap-3">
            <Input
              type="text"
              placeholder="Calle"
              icon={<MapPin size={20} />}
              {...register("address.street", {
                required: "La calle es requerida",
              })}
              error={errors.address?.street?.message}
              disabled={isPending}
            />
            <div className="flex gap-3">
              <Input
                type="text"
                placeholder="Número"
                className="flex-1"
                {...register("address.number", {
                  required: "El número es requerido",
                })}
                error={errors.address?.number?.message}
                disabled={isPending}
              />
              <Input
                type="text"
                placeholder="Barrio"
                className="flex-1"
                {...register("address.neighborhood")}
                error={errors.address?.neighborhood?.message}
                disabled={isPending}
              />
            </div>
            <Input
              type="text"
              placeholder="Ciudad"
              {...register("address.city", {
                required: "La ciudad es requerida",
              })}
              error={errors.address?.city?.message}
              disabled={isPending}
            />
          </div>
        </div>

        <Input
          label="TELÉFONO DE CONTACTO"
          type="tel"
          placeholder="Ej: +54 11 1234-5678"
          icon={<Phone size={20} />}
          {...register("phone", {
            required: "El teléfono es requerido",
          })}
          error={errors.phone?.message}
          disabled={isPending}
        />

        {/* Schedule Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-text-secondary" />
            <span className="overline">HORARIO DE ATENCIÓN</span>
          </div>

          {scheduleSlots.length > 0 && (
            <div className="flex flex-col gap-2">
              <AnimatePresence>
                {scheduleSlots.map((slot, index) => (
                  <motion.div
                    key={`${slot.day}-${slot.open}-${slot.close}-${index}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <ScheduleSlotItem
                      slot={slot}
                      onRemove={() => handleRemoveSlot(index)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {scheduleSlots.length === 0 && (
            <p className="text-sm text-text-secondary">
              Agregá al menos un horario de atención.
            </p>
          )}

          <div className="flex flex-col gap-3 p-3 rounded-md bg-surface-2 border border-border">
            {/* Day selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                Días
              </label>
              <div className="flex gap-2 flex-wrap">
                {SHORT_DAY_NAMES.map((name, day) => {
                  const isSelected = selectedDays.has(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      disabled={isPending}
                      className={`flex-1 min-w-[2.5rem] py-2 px-1 rounded-md text-xs font-medium transition-all duration-normal ease-default border
                        ${isSelected
                          ? "bg-lime text-bg border-lime font-bold"
                          : "bg-surface text-text-secondary border-border hover:border-border-hover"
                        }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time selectors */}
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-xs font-medium text-text-secondary">
                  Desde
                </label>
                <select
                  value={newOpen}
                  onChange={(e) => setNewOpen(e.target.value)}
                  disabled={isPending}
                  className="font-ui w-full bg-surface text-text-primary py-3 px-4 rounded-md text-base outline-none transition-all duration-normal ease-default border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow appearance-none"
                >
                  <option value="">--:--</option>
                  {HALF_HOUR_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-xs font-medium text-text-secondary">
                  Hasta
                </label>
                <select
                  value={newClose}
                  onChange={(e) => setNewClose(e.target.value)}
                  disabled={isPending}
                  className="font-ui w-full bg-surface text-text-primary py-3 px-4 rounded-md text-base outline-none transition-all duration-normal ease-default border border-border focus:border-lime-border focus:ring-4 focus:ring-lime-glow appearance-none"
                >
                  <option value="">--:--</option>
                  {HALF_HOUR_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="button"
              variant="surface"
              size="md"
              onClick={handleAddSlots}
              disabled={isPending}
            >
              <Plus size={16} />
              AGREGAR HORARIO
            </Button>
          </div>

          {(scheduleError || errors.schedule?.message || errors.schedule?.root?.message) && (
            <span className="font-ui text-sm text-error">
              {scheduleError || errors.schedule?.message || errors.schedule?.root?.message}
            </span>
          )}
        </div>

        <Input
          label="DESCRIPCIÓN BREVE (OPCIONAL)"
          type="text"
          placeholder="Contá un poco sobre tu local..."
          icon={<FileText size={20} />}
          {...register("description", {
            maxLength: { value: 120, message: "Máximo 120 caracteres" },
          })}
          error={errors.description?.message}
          disabled={isPending}
        />

        <div className="mt-auto pt-8 pb-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!isValid || isPending}
          >
            {isPending ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                REGISTRANDO...
              </>
            ) : (
              <>
                REGISTRAR BAR
                <ArrowRight size={20} className="text-bg" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
