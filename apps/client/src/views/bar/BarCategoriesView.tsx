import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Wine,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  listDrinkCategories,
  createDrinkCategory,
  updateDrinkCategory,
  toggleDrinkCategoryStatus,
  deleteDrinkCategory,
} from "@/API/DrinkCategoryAPI";
import {
  createDrinkCategorySchema,
  editDrinkCategorySchema,
  type CreateDrinkCategoryFormData,
  type EditDrinkCategoryFormData,
  type DrinkCategory,
} from "@/types/drinkCategory";
import { Modal } from "@/components/ui/Modal";
import { toastApiError } from "@/utils/apiError";

export default function BarCategoriesView() {
  const { id: barId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingCategory, setEditingCategory] = useState<DrinkCategory | null>(
    null
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<DrinkCategory | null>(null);

  // ── Queries ──────────────────────────────────────────────────
  const {
    data: categoriesData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["drinkCategories", barId],
    queryFn: () => listDrinkCategories(barId!),
    enabled: !!barId,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ── Mutations ────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (formData: CreateDrinkCategoryFormData) =>
      createDrinkCategory(barId!, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drinkCategories", barId] });
      toast.success("Categoría creada");
      setShowCreateForm(false);
      createForm.reset();
    },
    onError: toastApiError,
  });

  const updateMut = useMutation({
    mutationFn: (data: { categoryId: string; formData: EditDrinkCategoryFormData }) =>
      updateDrinkCategory(barId!, data.categoryId, data.formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drinkCategories", barId] });
      toast.success("Categoría actualizada");
      setEditingCategory(null);
    },
    onError: toastApiError,
  });

  const toggleStatusMut = useMutation({
    mutationFn: (data: { categoryId: string; status: "active" | "inactive" }) =>
      toggleDrinkCategoryStatus(barId!, data.categoryId, data.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drinkCategories", barId] });
    },
    onError: toastApiError,
  });

  const deleteMut = useMutation({
    mutationFn: (categoryId: string) => deleteDrinkCategory(barId!, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drinkCategories", barId] });
      toast.success("Categoría eliminada");
    },
    onError: toastApiError,
  });

  // ── Forms ────────────────────────────────────────────────────
  const createForm = useForm<CreateDrinkCategoryFormData>({
    resolver: zodResolver(createDrinkCategorySchema),
    mode: "onChange",
  });

  const editForm = useForm<EditDrinkCategoryFormData>({
    resolver: zodResolver(editDrinkCategorySchema),
    mode: "onChange",
  });

  const categories = categoriesData?.categories ?? [];
  const warning = categoriesData?.warning;

  const handleEdit = (category: DrinkCategory) => {
    setEditingCategory(category);
    setShowCreateForm(false);
    editForm.reset({ name: category.name, price: category.price ?? undefined });
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    editForm.reset();
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    createForm.reset();
  };

  // ── Modal: ESC & click outside ───────────────────────────────
  const isAnyModalOpen = editingCategory || showCreateForm || categoryToDelete;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (categoryToDelete) {
          setCategoryToDelete(null);
        } else if (editingCategory) {
          handleCancelEdit();
        } else if (showCreateForm) {
          handleCancelCreate();
        }
      }
    },
    [categoryToDelete, editingCategory, showCreateForm]
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isAnyModalOpen, handleKeyDown]);

  const handleDelete = (category: DrinkCategory) => {
    setCategoryToDelete(category);
  };

  const handleConfirmDelete = () => {
    if (!categoryToDelete) return;
    deleteMut.mutate(categoryToDelete.id, {
      onSettled: () => setCategoryToDelete(null),
    });
  };

  const onCreateSubmit = (data: CreateDrinkCategoryFormData) => {
    createMut.mutate(data);
  };

  const onEditSubmit = (data: EditDrinkCategoryFormData) => {
    if (!editingCategory) return;
    updateMut.mutate({ categoryId: editingCategory.id, formData: data });
  };

  // ── Render ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <Loader2 size={32} className="text-lime animate-spin mb-4" />
        <p className="text-text-secondary text-base">Cargando categorías...</p>
      </div>
    );
  }

  if (isError || !categoriesData) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <p className="text-error text-base mb-4">Error al cargar categorías</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Volver
        </Button>
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
        <h1 className="text-xl font-display font-bold tracking-tight m-0">
          Categorías de Bebidas
        </h1>
      </header>

      {/* Warning */}
      {warning && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
          <AlertTriangle size={20} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400">{warning}</p>
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            key="create-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCancelCreate();
            }}
          >
            <motion.div
              key="create-modal-content"
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-md p-5 rounded-xl bg-surface-2 border border-border shadow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase text-text-secondary">
                  Nueva Categoría
                </h3>
                <button
                  onClick={handleCancelCreate}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-3 transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X size={18} className="text-text-secondary" />
                </button>
              </div>
              <form
                onSubmit={createForm.handleSubmit(onCreateSubmit)}
                className="flex flex-col gap-3"
              >
                <Input
                  label="NOMBRE"
                  type="text"
                  placeholder="Nombre de la categoría"
                  icon={<Tag size={18} />}
                  {...createForm.register("name")}
                  error={createForm.formState.errors.name?.message}
                  disabled={createMut.isPending}
                />
                <Input
                  label="PRECIO (OPCIONAL)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  icon={<Tag size={18} />}
                  {...createForm.register("price", { valueAsNumber: true })}
                  error={createForm.formState.errors.price?.message}
                  disabled={createMut.isPending}
                />
                <div className="flex gap-2 mt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={createMut.isPending}
                  >
                    {createMut.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    CREAR
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelCreate}
                    disabled={createMut.isPending}
                  >
                    CANCELAR
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category List */}
      <div className="flex flex-col gap-3 flex-1">
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center py-12">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-2 border border-border">
              <Wine size={28} className="text-text-secondary" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-text-secondary text-base">
                Sin categorías aún
              </p>
              <p className="text-text-secondary text-sm">
                Agregá categorías para organizar tus bebidas
              </p>
            </div>
          </div>
        ) : (
          categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between p-4 rounded-lg bg-surface-2 border border-border"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-medium text-text truncate">
                  {category.name}
                </span>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  {category.price !== undefined && category.price !== null && (
                    <span>${category.price.toFixed(2)}</span>
                  )}
                  {/* Badge de estado en español */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${category.status === "active"
                      ? "bg-lime/10 text-lime border border-lime/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                  >
                    {category.status === "active" ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                {/* Toggle switch — iOS/Android style */}
                <button
                  onClick={() =>
                    toggleStatusMut.mutate({
                      categoryId: category.id,
                      status:
                        category.status === "active" ? "inactive" : "active",
                    })
                  }
                  disabled={toggleStatusMut.isPending}
                  role="switch"
                  aria-checked={category.status === "active"}
                  aria-label={
                    category.status === "active"
                      ? "Desactivar categoría"
                      : "Activar categoría"
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 disabled:cursor-not-allowed disabled:opacity-50 ${category.status === "active" ? "bg-lime" : "bg-surface-3 border border-border"
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${category.status === "active"
                      ? "translate-x-[18px]"
                      : "translate-x-1"
                      }`}
                  />
                </button>
                <button
                  onClick={() => handleEdit(category)}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-3 transition-colors"
                  aria-label="Editar categoría"
                >
                  <Pencil size={16} className="text-text-secondary" />
                </button>
                <button
                  onClick={() => handleDelete(category)}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-error-dim transition-colors"
                  aria-label="Eliminar categoría"
                >
                  <Trash2 size={16} className="text-error" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Edit Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {editingCategory && (
          <motion.div
            key="edit-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCancelEdit();
            }}
          >
            <motion.div
              key="edit-modal-content"
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-md p-5 rounded-xl bg-surface-2 border border-border shadow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase text-text-secondary">
                  Editar Categoría
                </h3>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-3 transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X size={18} className="text-text-secondary" />
                </button>
              </div>
              <form
                onSubmit={editForm.handleSubmit(onEditSubmit)}
                className="flex flex-col gap-3"
              >
                <Input
                  label="NOMBRE"
                  type="text"
                  placeholder="Nombre de la categoría"
                  icon={<Tag size={18} />}
                  {...editForm.register("name")}
                  error={editForm.formState.errors.name?.message}
                  disabled={updateMut.isPending}
                />
                <Input
                  label="PRECIO (OPCIONAL)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  icon={<Tag size={18} />}
                  {...editForm.register("price", { valueAsNumber: true })}
                  error={editForm.formState.errors.price?.message}
                  disabled={updateMut.isPending}
                />
                <div className="flex gap-2 mt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={updateMut.isPending}
                  >
                    {updateMut.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Pencil size={16} />
                    )}
                    GUARDAR
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={updateMut.isPending}
                  >
                    CANCELAR
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ──────────────────────── */}
      <Modal
        isOpen={!!categoryToDelete}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar categoría"
        description={
          categoryToDelete
            ? `¿Eliminar la categoría "${categoryToDelete.name}"? Esta acción no se puede deshacer.`
            : undefined
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        isPending={deleteMut.isPending}
      />

      {/* Bottom padding so content isn't hidden behind the fixed button */}
      <div className="h-20" />

      {/* ── Add Button (fixed, sits above the bottom nav) ── */}
      <div
        className="fixed left-0 right-0 z-50 pointer-events-none"
        style={{
          bottom: "calc(var(--height-nav) + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="max-w-[var(--width-app)] mx-auto px-4 pt-4 pb-2 drop-shadow-2xl">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => setShowCreateForm(true)}
            className="pointer-events-auto"
          >
            <Plus size={20} />
            AGREGAR CATEGORÍA
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
