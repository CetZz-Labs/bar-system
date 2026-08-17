import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  Gift,
  Plus,
  Pencil,
  Trash2,
  Power,
  Package,
  Infinity as InfinityIcon,
  X,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { getBarRewards, createReward, updateReward, deleteReward } from "@/API/RewardAPI";
import { getMyBars } from "@/API/BarAPI";
import { rewardFormSchema, type Reward, type RewardFormData, type RewardStatus } from "@/types/reward";
import { toastApiError } from "@/utils/apiError";

const defaultFormValues: RewardFormData = {
  name: "",
  description: "",
  pointsRequired: 1,
  unlimitedStock: false,
  stock: undefined,
};

function StatusBadge({ status }: { status: RewardStatus }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${
        isActive
          ? "bg-lime/10 text-lime border-lime/20"
          : "bg-surface-3 text-text-secondary border-border"
      }`}
    >
      {isActive ? "Activa" : "Inactiva"}
    </span>
  );
}

export default function BarRewardsView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [rewardToDelete, setRewardToDelete] = useState<Reward | null>(null);

  const { data: rewards, isLoading: isLoadingRewards, isError } = useQuery({
    queryKey: ["barRewards", id],
    queryFn: () => getBarRewards(id!),
    enabled: !!id,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Reusa la misma query de "Mis bares" (ya cacheada en MyBarsView) para
  // resolver el rol del usuario logueado en este bar puntual, sin inventar
  // un mecanismo de contexto nuevo (ver frontend.md — LB-66 ya expone el rol
  // por bar a través de este mismo endpoint).
  const { data: myBars, isLoading: isLoadingRole } = useQuery({
    queryKey: ["myBars"],
    queryFn: getMyBars,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isOwner = myBars?.find((bar) => bar.id === id)?.role === "OWNER";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RewardFormData>({
    resolver: zodResolver(rewardFormSchema),
    defaultValues: defaultFormValues,
    // El campo `stock` se desmonta condicionalmente cuando se tilda "Stock
    // ilimitado". Sin shouldUnregister, react-hook-form conserva el último
    // valor "crudo" del input desmontado (NaN si nunca se tocó, por
    // `valueAsNumber` en un <input type=number> vacío) y el resolver de zod
    // lo vuelve a validar en cada submit aunque ya no esté visible.
    shouldUnregister: true,
  });

  const unlimitedStock = watch("unlimitedStock");

  const openCreateForm = () => {
    setEditingReward(null);
    reset(defaultFormValues);
    setIsFormOpen(true);
  };

  const openEditForm = (reward: Reward) => {
    setEditingReward(reward);
    reset({
      name: reward.name,
      description: reward.description ?? "",
      pointsRequired: reward.pointsRequired,
      unlimitedStock: reward.unlimitedStock,
      stock: reward.stock,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingReward(null);
    reset(defaultFormValues);
  };

  const saveMut = useMutation({
    mutationFn: (data: RewardFormData) => {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        pointsRequired: data.pointsRequired,
        unlimitedStock: data.unlimitedStock,
        stock: data.unlimitedStock ? undefined : data.stock,
      };
      return editingReward
        ? updateReward(id!, editingReward.id, payload)
        : createReward(id!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barRewards", id] });
      toast.success(editingReward ? "Recompensa actualizada correctamente" : "Recompensa creada correctamente");
      closeForm();
    },
    onError: toastApiError,
  });

  const toggleStatusMut = useMutation({
    mutationFn: ({ rewardId, status }: { rewardId: string; status: RewardStatus }) =>
      updateReward(id!, rewardId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barRewards", id] });
      toast.success("Estado actualizado correctamente");
    },
    onError: toastApiError,
  });

  const deleteMut = useMutation({
    mutationFn: (rewardId: string) => deleteReward(id!, rewardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barRewards", id] });
      toast.success("Recompensa eliminada correctamente");
      setRewardToDelete(null);
    },
    onError: toastApiError,
  });

  const onSubmit = (data: RewardFormData) => saveMut.mutate(data);

  const isLoading = isLoadingRewards || isLoadingRole;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <Loader2 size={32} className="text-lime animate-spin mb-4" />
        <p className="text-text-secondary text-base">Cargando recompensas...</p>
      </div>
    );
  }

  if (isError || !rewards) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <p className="text-error text-base mb-4">Error al cargar las recompensas del bar</p>
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
          Recompensas del bar
        </h1>
      </header>

      {isOwner && !isFormOpen && (
        <Button variant="primary" size="lg" fullWidth onClick={openCreateForm} className="mb-6">
          <Plus size={20} />
          NUEVA RECOMPENSA
        </Button>
      )}

      {/* Alta / edición (sección inline, no hay plantilla de modal con
          contenido de formulario en @/components/ui/Modal — ver
          progress/implementers/impl_LB-67.md) */}
      <AnimatePresence>
        {isOwner && isFormOpen && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4 mb-6 p-4 rounded-lg bg-surface-2 border border-border overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
                <Gift size={20} className="text-lime" />
                {editingReward ? "Editar recompensa" : "Nueva recompensa"}
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

            <Input
              label="NOMBRE"
              aria-label="NOMBRE"
              type="text"
              placeholder="Ej: Chopp gratis"
              {...register("name")}
              error={errors.name?.message}
              disabled={saveMut.isPending}
            />

            <Input
              label="DESCRIPCIÓN (OPCIONAL)"
              aria-label="DESCRIPCIÓN (OPCIONAL)"
              type="text"
              placeholder="Contá de qué se trata la recompensa..."
              {...register("description")}
              error={errors.description?.message}
              disabled={saveMut.isPending}
            />

            <Input
              label="PUNTOS REQUERIDOS"
              aria-label="PUNTOS REQUERIDOS"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="100"
              {...register("pointsRequired", { valueAsNumber: true })}
              error={errors.pointsRequired?.message}
              disabled={saveMut.isPending}
            />

            <label className="flex items-center gap-2 text-sm text-text-secondary select-none">
              <input
                type="checkbox"
                {...register("unlimitedStock")}
                disabled={saveMut.isPending}
                className="w-4 h-4 accent-lime"
              />
              Stock ilimitado
            </label>

            {!unlimitedStock && (
              <Input
                label="STOCK"
                aria-label="STOCK"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="10"
                {...register("stock", { valueAsNumber: true })}
                error={errors.stock?.message}
                disabled={saveMut.isPending}
              />
            )}

            <div className="flex gap-3 mt-2">
              <Button
                type="button"
                variant="surface"
                size="md"
                fullWidth
                onClick={closeForm}
                disabled={saveMut.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                disabled={saveMut.isPending}
              >
                {saveMut.isPending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {editingReward ? "Guardar" : "Crear"}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Listado (LB-67 pide "tabla"; se implementa como lista de filas
          responsive, siguiendo el patrón visual de tarjetas ya establecido
          en MyBarsView.tsx en vez de un <table> HTML literal — ver
          progress/implementers/impl_LB-67.md) */}
      {rewards.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-2 border border-border">
            <Gift size={28} className="text-text-secondary" />
          </div>
          <p className="text-text-secondary text-base">
            {isOwner ? "Todavía no creaste ninguna recompensa." : "Este bar todavía no tiene recompensas cargadas."}
          </p>
        </div>
      )}

      {rewards.length > 0 && (
        <div className="flex flex-col gap-3">
          {rewards.map((reward) => (
            <motion.div
              key={reward.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2 p-4 rounded-lg bg-surface-2 border border-border"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-display font-bold tracking-tight leading-tight">
                  {reward.name}
                </h3>
                <StatusBadge status={reward.status} />
              </div>

              {reward.description && (
                <p className="text-sm text-text-secondary leading-relaxed">{reward.description}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                  <Gift size={14} />
                  {reward.pointsRequired} pts
                </span>
                <span className="flex items-center gap-1">
                  {reward.unlimitedStock ? (
                    <>
                      <InfinityIcon size={14} />
                      Ilimitado
                    </>
                  ) : (
                    <>
                      <Package size={14} />
                      Stock: {reward.stock ?? 0}
                    </>
                  )}
                </span>
              </div>

              {isOwner && (
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditForm(reward)}
                    disabled={toggleStatusMut.isPending || deleteMut.isPending}
                  >
                    <Pencil size={16} />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toggleStatusMut.mutate({
                        rewardId: reward.id,
                        status: reward.status === "active" ? "inactive" : "active",
                      })
                    }
                    disabled={toggleStatusMut.isPending || deleteMut.isPending}
                  >
                    <Power size={16} />
                    {reward.status === "active" ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setRewardToDelete(reward)}
                    disabled={toggleStatusMut.isPending || deleteMut.isPending}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!rewardToDelete}
        onClose={() => setRewardToDelete(null)}
        onConfirm={() => rewardToDelete && deleteMut.mutate(rewardToDelete.id)}
        title="Eliminar recompensa"
        description={`¿Seguro que querés eliminar "${rewardToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isPending={deleteMut.isPending}
      />
    </motion.div>
  );
}
