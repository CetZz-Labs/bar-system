import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { activateCashierAccount } from "@/API/AuthAPI";
import { activateCashierAccountSchema, type ActivateCashierAccountFormData } from "@/types/auth";
import { toastApiError } from "@/utils/apiError";

/**
 * LB-115: pantalla de activación de cuenta de cajero. El candidato llega
 * acá desde el link del email de invitación (AuthEmail.sendCashierInviteEmail)
 * e ingresa el código de 6 dígitos junto con la contraseña que va a usar de
 * ahora en más — todo en un solo submit (a diferencia del flujo de
 * "olvidé mi contraseña", que separa validar-token y setear-password en dos
 * pantallas: acá no hace falta, porque `activateCashierAccount` ya valida
 * el token como parte de la misma operación atómica).
 */
export default function ActivateCashierAccountView() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ActivateCashierAccountFormData>({
    resolver: zodResolver(activateCashierAccountSchema),
    defaultValues: { token: "", password: "", confirmPassword: "" },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: activateCashierAccount,
    onError: toastApiError,
    onSuccess: (data) => {
      toast.success(data);
      navigate("/login");
    },
  });

  const onSubmit = (data: ActivateCashierAccountFormData) => mutate(data);

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 h-full"
    >
      <div className="mb-10">
        <h1 className="mb-2">Activá tu cuenta<br />de cajero</h1>
        <p className="text-text-secondary text-base">
          Ingresá el código que recibiste por email y elegí tu contraseña para empezar.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 flex-1" noValidate>
        <Input
          label="CÓDIGO DE 6 DÍGITOS"
          aria-label="CÓDIGO DE 6 DÍGITOS"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          icon={<KeyRound size={20} />}
          {...register("token")}
          error={errors.token?.message}
          disabled={isPending}
        />

        <Input
          label="CONTRASEÑA"
          aria-label="CONTRASEÑA"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          {...register("password")}
          error={errors.password?.message}
          disabled={isPending}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="focus:outline-none flex items-center justify-center text-text-secondary hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          }
        />

        <Input
          label="REPETIR CONTRASEÑA"
          aria-label="REPETIR CONTRASEÑA"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          {...register("confirmPassword")}
          error={errors.confirmPassword?.message}
          disabled={isPending}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          className="mt-2"
          disabled={isPending}
        >
          {isPending ? "ACTIVANDO..." : "ACTIVAR CUENTA"}
          {!isPending && <ArrowRight size={20} className="text-bg" />}
        </Button>

        <div className="mt-4 text-center pb-8">
          <span className="text-text-secondary text-sm">¿Ya activaste tu cuenta? </span>
          <Link to="/login" className="text-lime font-bold no-underline">
            Iniciar sesión
          </Link>
        </div>
      </form>
    </motion.div>
  );
}
