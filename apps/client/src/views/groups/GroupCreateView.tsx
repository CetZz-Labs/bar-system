import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Loader2, Type, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileUpload } from "@/components/ui/FileUpload";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { createGroup } from "@/API/GroupAPI";
import { getUserGroups } from "@/API/UserAPI";
import { createGroupSchema, type CreateGroupFormData, GROUP_TYPES } from "@/types/group";
import { toastApiError } from "@/utils/apiError";

const TYPE_OPTIONS = [
  { label: "Abierto", value: "OPEN" },
  { label: "Cerrado", value: "CLOSED" },
];

export default function GroupCreateView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isValid, setIsValid] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateGroupFormData>({
    mode: "onChange",
    defaultValues: {
      name: "",
      description: "",
      type: "OPEN",
    },
  });

  const watchedValues = watch();

  const typeValue = watchedValues.type;

  register("type", { required: "Seleccioná un tipo" });

  const { data: groups } = useQuery({
    queryKey: ["userGroups"],
    queryFn: getUserGroups,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const ledGroupsCount = groups?.filter((g) => g.role === "admin").length ?? 0;
  const isLeaderLimitReached = ledGroupsCount >= 3;

  useEffect(() => {
    const result = createGroupSchema.safeParse(watchedValues);
    setIsValid(result.success);
  }, [watchedValues]);

  useEffect(() => {
    if (avatarFile) {
      const url = URL.createObjectURL(avatarFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [avatarFile]);

  const mutation = useMutation({
    mutationFn: createGroup,
    onError: toastApiError,
    onSuccess: (data) => {
      if (!data) return;
      toast.success("Grupo creado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["userGroups"] });
      navigate(`/groups/${data.slug}`, { state: { group: data } });
    },
  });

  const onSubmit = useCallback(
    (formData: CreateGroupFormData) => {
      if (isLeaderLimitReached) {
        toast.error("Solo podés liderar hasta 3 grupos");
        return;
      }

      const data = new FormData();
      data.append("name", formData.name.trim());
      data.append("type", formData.type);
      if (formData.description?.trim()) {
        data.append("description", formData.description.trim());
      }
      if (avatarFile) {
        data.append("photo", avatarFile);
      }

      mutation.mutate(data);
    },
    [avatarFile, isLeaderLimitReached, mutation]
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      if (GROUP_TYPES.includes(value as (typeof GROUP_TYPES)[number])) {
        setValue("type", value as (typeof GROUP_TYPES)[number], {
          shouldValidate: true,
        });
      }
    },
    [setValue]
  );

  const isPending = mutation.isPending;

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
          Crear grupo
        </h1>
      </header>

      {isLeaderLimitReached && (
        <div className="mb-6 p-4 bg-error-dim border border-error-border rounded-md">
          <p className="text-error text-sm font-medium">
            Ya liderás 3 grupos. No podés crear más.
          </p>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-6 flex-1"
      >
        <Input
          label="NOMBRE DEL GRUPO"
          type="text"
          placeholder="Ej: La Banda del Barrio"
          icon={<Type size={20} />}
          {...register("name", {
            required: "El nombre es requerido",
            minLength: { value: 3, message: "Mínimo 3 caracteres" },
            maxLength: { value: 40, message: "Máximo 40 caracteres" },
            pattern: { value: /^[a-zA-Z0-9\s-]+$/, message: "Solo letras, números, espacios y guiones" },
          })}
          error={errors.name?.message}
          disabled={isPending || isLeaderLimitReached}
        />

        <Input
          label="DESCRIPCIÓN (OPCIONAL)"
          type="text"
          placeholder="Contá de qué se trata tu grupo..."
          icon={<FileText size={20} />}
          {...register("description", {
            maxLength: { value: 120, message: "Máximo 120 caracteres" },
          })}
          error={errors.description?.message}
          disabled={isPending || isLeaderLimitReached}
        />

        <SegmentedControl
          label="TIPO DE GRUPO"
          name="group-type"
          options={TYPE_OPTIONS}
          value={typeValue}
          onChange={handleTypeChange}
          error={errors.type?.message}
          disabled={isPending || isLeaderLimitReached}
        />

        <FileUpload
          onFileSelect={setAvatarFile}
          previewUrl={previewUrl}
          label="FOTO DEL GRUPO (OPCIONAL)"
          disabled={isPending || isLeaderLimitReached}
        />

        <div className="mt-auto pt-8 pb-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!isValid || isPending || isLeaderLimitReached}
          >
            {isPending ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                CREANDO...
              </>
            ) : (
              <>
                CREAR GRUPO
                <ArrowRight size={20} className="text-bg" />
              </>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
