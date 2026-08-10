import { useState } from "react"
import { useForm } from "react-hook-form"
import type { CashierLoginForm } from "@/types/cashier"
import { toastApiError } from "@/utils/apiError"
import { getDeviceInfo } from "@/utils/device"
import { toast } from "sonner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cashierLogin, cashierSession } from "@/API/CashierAPI"
import { useNavigate, useParams } from "react-router"
import { motion } from "motion/react"
import { Eye, EyeOff, Store, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type CashierLoginFormData = Pick<CashierLoginForm, 'email' | 'password'>

export default function CashierLoginView() {
    const { barId } = useParams<{ barId: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [showPassword, setShowPassword] = useState(false)

    const defaultValues: CashierLoginFormData = {
        email: '',
        password: ''
    }

    const { register, handleSubmit, formState: { errors } } = useForm<CashierLoginFormData>({
        defaultValues
    })

    const { mutate, isPending } = useMutation({
        mutationFn: cashierLogin,
        onSuccess: async () => {
            toast.success('Turno iniciado correctamente')
            const cashierData = await cashierSession()
            queryClient.setQueryData(['cashier-session'], cashierData)
            navigate(`/bar/${barId}/cajero`)
        },
        onError: toastApiError
    })

    const onSubmit = (data: CashierLoginFormData) => {
        if (!barId) return
        mutate({
            ...data,
            barId,
            deviceInfo: getDeviceInfo()
        })
    }

    return (
        <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col flex-1 pb-nav pt-5 px-4 h-full"
        >
            {/* Header / Logo */}
            <header className="flex items-center gap-2 mb-10 mt-4">
                <div className="flex items-center justify-center p-1 rounded-md bg-lime">
                    <Store size={24} className="text-bg" strokeWidth={2.5} />
                </div>
                <span className="font-display font-bold text-[20px]">Panel del cajero</span>
            </header>

            {/* Titles */}
            <div className="mb-10">
                <h1 className="mb-2">Iniciá tu turno</h1>
                <p className="text-text-secondary text-base">Ingresá con tu cuenta para abrir tu turno en este bar</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 flex-1">
                <Input
                    label="EMAIL"
                    type="email"
                    placeholder="tu@email.com"
                    {...register('email', { required: 'El email es requerido' })}
                    error={errors.email?.message}
                />

                <Input
                    label="CONTRASEÑA"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...register('password', { required: 'La contraseña es requerida' })}
                    error={errors.password?.message}
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

                <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    className="mt-6"
                    disabled={isPending || !barId}
                >
                    {isPending ? "INGRESANDO..." : "INICIAR TURNO"}
                    {!isPending && <ArrowRight size={20} className="text-bg" />}
                </Button>
            </form>
        </motion.div>
    )
}
