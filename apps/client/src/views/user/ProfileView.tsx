import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getUserProfile, updateUserProfile, uploadAvatar, getUserGroups } from "@/API/UserAPI";
import { useAuth } from "@/hooks/useAuth";
import { toastApiError } from "@/utils/apiError";
import { cropImageToSquare } from "@/utils/cropImageToSquare";
import { motion } from "motion/react";
import { ArrowLeft, Check, X, Pencil, Loader2, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { FileUpload } from "@/components/ui/FileUpload";
import { useNavigate } from "react-router";

function getFullName(profile: { name?: string; lastName?: string; fullName?: string }): string {
  if (profile.fullName) return profile.fullName;
  if (profile.name && profile.lastName) return `${profile.name} ${profile.lastName}`;
  return profile.name || "";
}

function validateFullName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return "Mínimo 2 caracteres";
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return "Ingresá nombre y apellido";
  if (parts[0].length < 2) return "El nombre debe tener al menos 2 caracteres";
  const lastName = parts.slice(1).join(" ");
  if (lastName.length < 2) return "El apellido debe tener al menos 2 caracteres";
  if (trimmed.length > 50) return "Máximo 50 caracteres";
  return null;
}

function splitFullName(value: string): { name: string; lastName: string } {
  const parts = value.trim().split(/\s+/);
  return {
    name: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export default function ProfileView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { logoutUser } = useAuth();

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getUserProfile,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const { data: groups, isLoading: groupsLoading, isError: groupsError } = useQuery({
    queryKey: ['userGroups'],
    queryFn: getUserGroups,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: !!profile,
  });

  // Inline name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const isButtonPressed = useRef(false);

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // Logout modal state
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const { mutate: updateName, isPending: isUpdatingName } = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: (data) => {
      toast.success(data || "Nombre actualizado exitosamente");
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setIsEditingName(false);
      setNameError(null);
    },
    onError: toastApiError,
  });

  const { mutate: uploadAvatarMut, isPending: isUploadingAvatar } = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: () => {
      toast.success("Avatar actualizado exitosamente");
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setAvatarFile(null);
      setAvatarPreview(null);
    },
    onError: toastApiError,
  });

  const handleStartEdit = useCallback(() => {
    if (!profile) return;
    setEditName(getFullName(profile));
    setNameError(null);
    setIsEditingName(true);
  }, [profile]);

  const handleSaveName = useCallback(() => {
    const error = validateFullName(editName);
    if (error) {
      setNameError(error);
      return;
    }
    const { name, lastName } = splitFullName(editName);
    updateName({ name, lastName, birthdate: profile?.birthdate || undefined });
  }, [editName, profile, updateName]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingName(false);
    setNameError(null);
  }, []);

  const handleBlur = useCallback(() => {
    if (isButtonPressed.current) {
      isButtonPressed.current = false;
      return;
    }
    handleSaveName();
  }, [handleSaveName]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveName, handleCancelEdit]);

  const handleFileSelect = useCallback(async (file: File | null) => {
    if (file) {
      try {
        setIsCropping(true);
        const cropped = await cropImageToSquare(file);
        setAvatarFile(cropped);
        setAvatarPreview(URL.createObjectURL(cropped));
      } catch {
        toast.error("No se pudo procesar la imagen");
        setAvatarFile(null);
        if (avatarPreview) {
          URL.revokeObjectURL(avatarPreview);
        }
        setAvatarPreview(null);
      } finally {
        setIsCropping(false);
      }
    } else {
      setAvatarFile(null);
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      setAvatarPreview(null);
    }
  }, [avatarPreview]);

  const handleUploadAvatar = useCallback(() => {
    if (avatarFile) {
      uploadAvatarMut(avatarFile);
    }
  }, [avatarFile, uploadAvatarMut]);

  const handleLogoutConfirm = useCallback(() => {
    logoutUser();
    setIsLogoutModalOpen(false);
  }, [logoutUser]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <Loader2 size={32} className="text-lime animate-spin mb-4" />
        <p className="text-text-secondary text-base">Cargando tu perfil...</p>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[100dvh]">
        <p className="text-error text-base mb-4">Error al cargar el perfil</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
      </div>
    );
  }

  const fullName = getFullName(profile);

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Mi Perfil
        </h1>
      </header>

      {/* Avatar & Identity */}
      <div className="flex flex-col items-center mb-8">
        <Avatar
          src={profile.avatarUrl}
          alt={fullName || profile.email}
          size="lg"
          className="mb-4 border-2 border-lime-border"
        />
        <p className="text-text-secondary font-medium font-ui mb-2">
          {profile.email}
        </p>

        {/* Inline Name Editing */}
        <div className="w-full max-w-xs">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  error={nameError || undefined}
                  disabled={isUpdatingName}
                  className="text-center"
                />
              </div>
              <button
                type="button"
                onMouseDown={() => { isButtonPressed.current = true; }}
                onClick={handleSaveName}
                disabled={isUpdatingName}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-lime text-bg hover:bg-lime/90 transition-colors shrink-0"
                aria-label="Guardar nombre"
              >
                {isUpdatingName ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              </button>
              <button
                type="button"
                onMouseDown={() => { isButtonPressed.current = true; }}
                onClick={handleCancelEdit}
                disabled={isUpdatingName}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-2 text-text-secondary hover:bg-surface-3 transition-colors shrink-0"
                aria-label="Cancelar edición"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center justify-center gap-2 w-full text-text-primary font-display font-semibold text-xl hover:text-lime transition-colors"
            >
              <span>{fullName || "Sin nombre"}</span>
              <Pencil size={16} className="text-text-secondary" />
            </button>
          )}
        </div>
      </div>

      {/* Avatar Upload Section */}
      <div className="mb-8 relative">
        <FileUpload
          onFileSelect={handleFileSelect}
          previewUrl={avatarPreview}
        />
        {isCropping && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm rounded-md">
            <Loader2 size={32} className="text-lime animate-spin mb-2" />
            <p className="text-text-secondary text-sm">Procesando imagen...</p>
          </div>
        )}
        {avatarFile && (
          <div className="mt-3">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={handleUploadAvatar}
              disabled={isUploadingAvatar || isCropping}
            >
              {isUploadingAvatar ? "Subiendo..." : "Guardar avatar"}
              {!isUploadingAvatar && <Check size={18} className="text-bg" />}
            </Button>
          </div>
        )}
      </div>

      {/* Groups Section */}
      <div className="mb-8">
        <h2 className="text-lg font-display font-bold tracking-tight mb-4 flex items-center gap-2">
          <Users size={20} className="text-lime" />
          Mis grupos
        </h2>

        {groupsLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={24} className="text-lime animate-spin" />
          </div>
        )}

        {groupsError && (
          <div className="text-center py-4">
            <p className="text-error text-sm mb-2">Error al cargar grupos</p>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['userGroups'] })}>
              Reintentar
            </Button>
          </div>
        )}

        {!groupsLoading && !groupsError && groups && groups.length === 0 && (
          <div className="text-center py-6 bg-surface-2 rounded-xl border border-border">
            <Users size={32} className="text-text-muted mx-auto mb-2" />
            <p className="text-text-secondary text-sm">Todavía no pertenecés a ningún grupo</p>
          </div>
        )}

        {!groupsLoading && !groupsError && groups && groups.length > 0 && (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div
                key={group.groupId}
                className="flex items-center gap-4 p-4 bg-surface-2 rounded-xl border border-border transition-colors hover:border-border-hover"
              >
                <Avatar
                  src={group.avatarUrl}
                  alt={group.name}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-ui font-semibold text-text-primary truncate">
                    {group.name}
                  </p>
                  <p className="text-text-secondary text-sm capitalize">
                    {group.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="mt-auto pt-4 pb-4">
        <Button
          variant="danger"
          size="lg"
          fullWidth
          onClick={() => setIsLogoutModalOpen(true)}
        >
          Cerrar sesión
          <LogOut size={20} />
        </Button>
      </div>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
        title="¿Querés cerrar sesión?"
        description="Si confirmás, se cerrará tu sesión actual y volverás a la pantalla de inicio de sesión."
        confirmText="Cerrar sesión"
        cancelText="Cancelar"
      />
    </motion.div>
  );
}
