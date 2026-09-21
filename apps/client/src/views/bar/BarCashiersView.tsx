import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Users,
  UserPlus,
  Power,
  Mail,
  Clock,
  X,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getBarCashiers, createCashier, updateCashier } from "@/API/CashierManagementAPI";
import { createCashierFormSchema, type Cashier, type CreateCashierFormData } from "@/types/cashierManagement";
import { toastApiError } from "@/utils/apiError";

const defaultFormValues: CreateCashierFormData = {
  name: "",
  lastName: "",
  email: "",
};

function StatusBadge({ cashier }: { cashier: Cashier }) {
  if (!cashier.isActive) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border bg-surface-3 text-text-secondary border-border">
        Desactivado
      </span>
    );
  }
  if (!cashier.user.accountActive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border bg-warning-dim text-warning border-warning-border">
        <Clock size={12} />
        Pendiente de activación
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border bg-lime/10 text-lime border-lime/20">
      Activo
    </span>
  );
}

export default function BarCashiersView() {
  // RequireBarOwner (router.tsx) usa el param `barId` para esta ruta.
  const { barId } = useParams<{ barId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: cashiers, isLoading, isError } = useQuery({
    queryKey: ["barCashiers", barId],
    queryFn: () => getBarCashiers(barId!),
    enabled: !!barId,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCashierFormData>({
    resolver: zodResolver(createCashierFormSchema),
    defaultValues: defaultFormValues,
  });

  const openCreateForm = () => {
    reset(defaultFormValues);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    reset(defaultFormValues);
  };

  const createMut = useMutation({
    mutationFn: (data: CreateCashierFormData) => createCashier(barId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barCashiers", barId] });
      toast.success("Cajero dado de alta correctamente");
      closeForm();
    },
    onError: toastApiError,
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ cashierId, isActive }: { cashierId: string; isActive: boolean }) =>
      updateCashier(barId!, cashierId, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barCashiers", barId] });
      toast.success("Estado actualizado correctamente");
    },
    onError: toastApiError,
  });

  const onSubmit = (data: CreateCashierFormData) => createMut.mutate(data);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <Loader2 size={32} className="text-lime animate-spin mb-4" />
        <p className="text-text-secondary text-base">Cargando cajeros...</p>
      </div>
    );
  }

  if (isError || !cashiers) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <p className="text-error text-base mb-4">Error al cargar los cajeros del bar</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
      </div>
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
          Cajeros del bar
        </h1>
      </header>

      {!isFormOpen && (
        <Button variant="primary" size="lg" fullWidth onClick={openCreateForm} className="mb-6">
          <UserPlus size={20} />
          NUEVO CAJERO
        </Button>
      )}

      <AnimatePresence>
        {isFormOpen && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4 mb-6 p-4 rounded-lg bg-surface-2 border border-border overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
                <UserPlus size={20} className="text-lime" />
                Nuevo cajero
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-3 hover:bg-surface-3/70 transition-colors"
                aria-label="Cerrar formulario"
              >
                <X size={16} className="text-text-secondary" />
              </button>
            </div>

            <p className="text-text-secondary text-sm -mt-2">
              Si la persona ya tiene una cuenta en La Banda, se vincula directo. Si
              no, le mandamos un email para que active su cuenta y elija su
              contraseña.
            </p>

            <Input
              label="NOMBRE"
              aria-label="NOMBRE"
              type="text"
              placeholder="Ej: Juan"
              {...register("name")}
              error={errors.name?.message}
              disabled={createMut.isPending}
            />

            <Input
              label="APELLIDO"
              aria-label="APELLIDO"
              type="text"
              placeholder="Ej: Pérez"
              {...register("lastName")}
              error={errors.lastName?.message}
              disabled={createMut.isPending}
            />

            <Input
              label="EMAIL"
              aria-label="EMAIL"
              type="email"
              placeholder="cajero@email.com"
              icon={<Mail size={20} />}
              {...register("email")}
              error={errors.email?.message}
              disabled={createMut.isPending}
            />

            <div className="flex gap-3 mt-2">
              <Button
                type="button"
                variant="surface"
                size="md"
                fullWidth
                onClick={closeForm}
                disabled={createMut.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                disabled={createMut.isPending}
              >
                {createMut.isPending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                Dar de alta
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {cashiers.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-2 border border-border">
            <Users size={28} className="text-text-secondary" />
          </div>
          <p className="text-text-secondary text-base">
            Todavía no diste de alta ningún cajero.
          </p>
        </div>
      )}

      {cashiers.length > 0 && (
        <div className="flex flex-col gap-3">
          {cashiers.map((cashier) => (
            <motion.div
              key={cashier.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2 p-4 rounded-lg bg-surface-2 border border-border"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-display font-bold tracking-tight leading-tight">
                  {cashier.user.name} {cashier.user.lastName}
                </h3>
                <StatusBadge cashier={cashier} />
              </div>

              <p className="text-sm text-text-secondary flex items-center gap-1">
                <Mail size={14} />
                {cashier.user.email}
              </p>

              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toggleActiveMut.mutate({ cashierId: cashier.id, isActive: !cashier.isActive })
                  }
                  disabled={toggleActiveMut.isPending}
                >
                  <Power size={16} />
                  {cashier.isActive ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
