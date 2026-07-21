import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  Save,
  AlertTriangle,
  Store,
  Phone,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileUpload } from "@/components/ui/FileUpload";
import { getBarProfile, updateBarProfile, uploadBarLogo, uploadBarCover } from "@/API/BarAPI";
import { type EditBarProfileFormData } from "@/types/bar";
import { toastApiError } from "@/utils/apiError";
import { cropImageToSquare } from "@/utils/cropImageToSquare";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import api from "@/libs/axios";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const COVER_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateImageFile(file: File, maxBytes: number): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Formato no permitido. Solo se aceptan JPG, PNG y WEBP.";
  }
  if (file.size > maxBytes) {
    const maxMB = maxBytes / (1024 * 1024);
    return `La imagen supera el límite de ${maxMB}MB.`;
  }
  return null;
}

export default function BarProfileView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: bar, isLoading, isError } = useQuery({
    queryKey: ["barProfile", id],
    queryFn: () => getBarProfile(id!),
    enabled: !!id,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditBarProfileFormData>({
    mode: "onChange",
  });

  useEffect(() => {
    if (bar) {
      reset({
        name: bar.name,
        description: bar.description ?? "",
        phone: bar.phone,
      });
      setCoverRemoved(false);
      setLogoRemoved(false);
    }
  }, [bar, reset]);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isCroppingLogo, setIsCroppingLogo] = useState(false);
  const [logoRemoved, setLogoRemoved] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [logoPreview, coverPreview]);

  const handleLogoSelect = useCallback(async (file: File | null) => {
    setLogoError(null);
    if (!file) {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(null);
      setLogoPreview(null);
      setLogoRemoved(true);
      return;
    }
    const error = validateImageFile(file, LOGO_MAX_BYTES);
    if (error) {
      setLogoError(error);
      toast.error(error);
      return;
    }
    try {
      setIsCroppingLogo(true);
      const cropped = await cropImageToSquare(file);
      setLogoFile(cropped);
      setLogoRemoved(false);
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(URL.createObjectURL(cropped));
    } catch {
      toast.error("No se pudo procesar la imagen");
    } finally {
      setIsCroppingLogo(false);
    }
  }, [logoPreview]);

  const handleCoverSelect = useCallback((file: File | null) => {
    setCoverError(null);
    if (!file) {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      setCoverFile(null);
      setCoverPreview(null);
      setCoverRemoved(true);
      return;
    }
    const error = validateImageFile(file, COVER_MAX_BYTES);
    if (error) {
      setCoverError(error);
      toast.error(error);
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverRemoved(false);
    setCoverPreview(URL.createObjectURL(file));
  }, [coverPreview]);

  const updateProfileMut = useMutation({
    mutationFn: (formData: EditBarProfileFormData) => updateBarProfile(id!, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["myBars"] });
    },
    onError: toastApiError,
  });

  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => uploadBarLogo(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["myBars"] });
      setLogoFile(null);
      setLogoPreview(null);
    },
    onError: toastApiError,
  });

  const uploadCoverMut = useMutation({
    mutationFn: (file: File) => uploadBarCover(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["myBars"] });
      setCoverFile(null);
      setCoverPreview(null);
    },
    onError: toastApiError,
  });

  const clearCoverMut = useMutation({
    mutationFn: () => api.patch(`/bar/${id}/perfil`, { coverUrl: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["myBars"] });
      setCoverRemoved(false);
    },
    onError: toastApiError,
  });

  const clearLogoMut = useMutation({
    mutationFn: () => api.patch(`/bar/${id}/perfil`, { logoUrl: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barProfile", id] });
      queryClient.invalidateQueries({ queryKey: ["myBars"] });
      setLogoRemoved(false);
    },
    onError: toastApiError,
  });

  const isSaving = updateProfileMut.isPending || uploadLogoMut.isPending || uploadCoverMut.isPending || clearCoverMut.isPending || clearLogoMut.isPending;

  const onSubmit = useCallback(
    async (formData: EditBarProfileFormData) => {
      const promises: Promise<unknown>[] = [];

      if (isDirty) {
        promises.push(updateProfileMut.mutateAsync(formData));
      }
      if (logoFile) {
        promises.push(uploadLogoMut.mutateAsync(logoFile));
      }
      if (coverFile) {
        promises.push(uploadCoverMut.mutateAsync(coverFile));
      }
      if (coverRemoved && !coverFile) {
        promises.push(clearCoverMut.mutateAsync());
      }
      if (logoRemoved && !logoFile) {
        promises.push(clearLogoMut.mutateAsync());
      }

      if (promises.length === 0) {
        toast("No hay cambios para guardar");
        return;
      }

      try {
        await Promise.all(promises);
        toast.success("Perfil actualizado exitosamente");
      } catch {
        // errors handled by each mutation
      }
    },
    [isDirty, logoFile, coverFile, coverRemoved, logoRemoved, updateProfileMut, uploadLogoMut, uploadCoverMut, clearCoverMut, clearLogoMut]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <Loader2 size={32} className="text-lime animate-spin mb-4" />
        <p className="text-text-secondary text-base">Cargando perfil...</p>
      </div>
    );
  }

  if (isError || !bar) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <p className="text-error text-base mb-4">Error al cargar el perfil del bar</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
      </div>
    );
  }

  const showLogoWarning = !bar.logoUrl && !logoFile && !logoRemoved;
  const showCover = !coverRemoved && (coverPreview || bar.coverUrl);
  const showLogo = !logoRemoved && (logoPreview || bar.logoUrl);

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
          Perfil del Bar
        </h1>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 flex-1">
        {/* Cover Section */}
        <div className="flex flex-col gap-2">
          {showCover ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
              <img
                src={coverPreview || resolveImageUrl(bar.coverUrl)}
                alt="Portada del bar"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <button
                type="button"
                onClick={() => handleCoverSelect(null)}
                className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full bg-error text-white hover:bg-error/80 transition-colors z-10"
                aria-label="Eliminar portada"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <FileUpload
              onFileSelect={handleCoverSelect}
              previewUrl={null}
              error={coverError ?? undefined}
              label="FOTO DE PORTADA (OPCIONAL)"
            />
          )}
          <p className="text-text-muted text-xs">
            Proporción 16:9 recomendada. JPG, PNG, WEBP. Máx. 3MB
          </p>
        </div>

        {/* Logo Section */}
        <div className="flex flex-col gap-2">
          {showLogoWarning && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={20} className="text-amber-400 shrink-0" />
              <p className="text-sm text-amber-400">
                Completar el logo para que tu bar sea visible para los usuarios
              </p>
            </div>
          )}
          {showLogo ? (
            <div className="relative w-full aspect-square max-w-[200px] rounded-lg overflow-hidden border border-border mx-auto">
              <img
                src={logoPreview || resolveImageUrl(bar.logoUrl)}
                alt="Logo del bar"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleLogoSelect(null)}
                className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full bg-error text-white hover:bg-error/80 transition-colors z-10"
                aria-label="Eliminar logo"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <FileUpload
                onFileSelect={handleLogoSelect}
                previewUrl={null}
                error={logoError ?? undefined}
                label="LOGO (OPCIONAL)"
              />
              {isCroppingLogo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm rounded-md">
                  <Loader2 size={32} className="text-lime animate-spin mb-2" />
                  <p className="text-text-secondary text-sm">Procesando imagen...</p>
                </div>
              )}
            </div>
          )}
          <p className="text-text-muted text-xs">
            Recorte cuadrado automático. Mínimo 200×200px. JPG, PNG, WEBP. Máx. 2MB
          </p>
        </div>

        {/* Data Section */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-display font-bold tracking-tight flex items-center gap-2">
            <Store size={20} className="text-lime" />
            Datos del bar
          </h2>

          <Input
            label="NOMBRE"
            type="text"
            placeholder="Nombre del bar"
            icon={<Store size={20} />}
            {...register("name", {
              required: "El nombre es requerido",
              minLength: { value: 3, message: "Mínimo 3 caracteres" },
              maxLength: { value: 60, message: "Máximo 60 caracteres" },
            })}
            error={errors.name?.message}
            disabled={isSaving}
          />

          <Input
            label="TELÉFONO"
            type="tel"
            placeholder="Ej: +54 11 1234-5678"
            icon={<Phone size={20} />}
            {...register("phone", {
              required: "El teléfono es requerido",
            })}
            error={errors.phone?.message}
            disabled={isSaving}
          />

          <Input
            label="DESCRIPCIÓN (OPCIONAL)"
            type="text"
            placeholder="Contá un poco sobre tu local..."
            icon={<FileText size={20} />}
            {...register("description", {
              maxLength: { value: 120, message: "Máximo 120 caracteres" },
            })}
            error={errors.description?.message}
            disabled={isSaving}
          />
        </div>

        {/* Save Button */}
        <div className="mt-auto pt-6 pb-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                GUARDANDO...
              </>
            ) : (
              <>
                GUARDAR CAMBIOS
                <Save size={20} className="text-bg" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
