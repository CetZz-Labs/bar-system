import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Calendar, Type, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileUpload } from "@/components/ui/FileUpload";
import { useAuth } from "@/hooks/useAuth";
import { updateUserProfile, uploadAvatar } from "@/API/UserAPI";
import { onboardingSchema } from "@/types/user";
import { toastApiError } from "@/utils/apiError";

type OnboardingForm = {
    fullName: string;
    birthdate: string;
};

export default function OnboardingView() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { data: session } = useAuth();

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isValid, setIsValid] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<OnboardingForm>({
        mode: "onChange",
        defaultValues: {
            fullName: "",
            birthdate: "",
        },
    });

    const watchedValues = watch();

    useEffect(() => {
        const result = onboardingSchema.safeParse(watchedValues);
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

    const profileMutation = useMutation({
        mutationFn: updateUserProfile,
        onError: toastApiError,
    });

    const avatarMutation = useMutation({
        mutationFn: uploadAvatar,
        onError: toastApiError,
    });

    const onSubmit = async (formData: OnboardingForm) => {
        const parts = formData.fullName.trim().split(/\s+/);
        const name = parts[0];
        const lastName = parts.slice(1).join(" ") || ".";

        try {
            await profileMutation.mutateAsync({
                name,
                lastName,
                birthdate: formData.birthdate,
            });

            if (avatarFile) {
                await avatarMutation.mutateAsync(avatarFile);
            }

            toast.success("Perfil completado exitosamente");
            queryClient.invalidateQueries({ queryKey: ["session"] });
            queryClient.invalidateQueries({ queryKey: ["userProfile"] });
            navigate("/profile");
        } catch {
            // Errors handled by mutation onError
        }
    };

    const isPending = profileMutation.isPending || avatarMutation.isPending;

    return (
        <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
        >
            {/* Header */}
            <header className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-lime">
                    <User size={20} className="text-bg" />
                </div>
                <h1 className="text-2xl font-display font-bold tracking-tight m-0">
                    Completá tu perfil
                </h1>
            </header>

            <p className="text-text-secondary text-base mb-8">
                Necesitamos algunos datos para continuar
            </p>

            {/* Email display */}
            {session?.email && (
                <div className="bg-surface-2 border border-border rounded-md px-4 py-3 mb-6">
                    <span className="text-text-muted text-xs overline">EMAIL</span>
                    <p className="text-text-primary font-ui text-base mt-1">{session.email}</p>
                </div>
            )}

            {/* Form */}
            <form
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col gap-6 flex-1"
            >
                <div className="flex flex-col gap-2">
                    <Input
                        label="NOMBRE COMPLETO"
                        type="text"
                        placeholder="Alex García"
                        icon={<Type size={20} />}
                        {...register("fullName", {
                            required: "Ingresá tu nombre completo",
                            validate: (val) => {
                                const words = val.trim().split(/\s+/).filter(Boolean);
                                if (words.length < 2) return "Ingresá nombre y apellido";
                                if (val.trim().length > 50) return "Máximo 50 caracteres";
                                return true;
                            },
                        })}
                        error={errors.fullName?.message}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <Input
                        label="FECHA DE NACIMIENTO"
                        type="date"
                        icon={<Calendar size={20} />}
                        {...register("birthdate", {
                            required: "La fecha de nacimiento es requerida",
                        })}
                        error={errors.birthdate?.message}
                        style={{ colorScheme: "dark" }}
                    />
                </div>

                <FileUpload
                    onFileSelect={setAvatarFile}
                    previewUrl={previewUrl}
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
                            "GUARDANDO..."
                        ) : (
                            <>
                                CONTINUAR
                                <ArrowRight size={20} className="text-bg" />
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </motion.div>
    );
}
