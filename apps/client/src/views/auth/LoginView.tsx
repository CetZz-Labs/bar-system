import { useState } from "react"
import { useForm } from "react-hook-form"
import type { LoginFormDataType } from "@/types/auth"
import { toastApiError } from "@/utils/apiError"
import { toast } from "sonner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { login, session } from "@/API/AuthAPI"
import { Link } from "react-router"
import { motion } from "motion/react"
import { Eye, EyeOff, Zap, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

export default function LoginView() {
    const queryClient = useQueryClient()
    const [showPassword, setShowPassword] = useState(false)
    
    const defaultValues: LoginFormDataType = {
        email: '',
        password: ''
    }

    const { register, handleSubmit, formState: { errors } } = useForm<LoginFormDataType>({ 
        defaultValues 
    })

    const { mutate, isPending } = useMutation({
        mutationFn: login,
        onSuccess: async () => {
            toast.success('Login exitoso')
            const user = await session()
            queryClient.setQueryData(['session'], user)
            // AuthLayout se encarga del redirect post-login (respeta state.from / ?redirect)
        },
        onError: toastApiError
    })

    const onSubmit = (data: LoginFormDataType) => mutate(data)

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
                    <Zap size={24} className="text-bg fill-bg" strokeWidth={2.5} />
                </div>
                <span className="font-display font-bold text-[20px]">NightOut</span>
            </header>

            {/* Titles */}
            <div className="mb-10">
                <h1 className="mb-2">Bienvenido<br/>de vuelta <span role="img" aria-label="moon">🌙</span></h1>
                <p className="text-text-secondary text-base">Iniciá sesión y seguí acumulando puntos</p>
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
                
                <div className="flex flex-col gap-2">
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
                    <div className="flex justify-end mt-1">
                        <Link 
                            to="/forgot-password" 
                            className="text-lime no-underline text-sm font-medium"
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>
                </div>

                <Button 
                    type="submit" 
                    variant="primary" 
                    size="lg" 
                    fullWidth 
                    className="mt-6"
                    disabled={isPending}
                >
                    {isPending ? "INGRESANDO..." : "INGRESAR"}
                    {!isPending && <ArrowRight size={20} className="text-bg" />}
                </Button>

                <div className="flex items-center gap-4 my-2">
                    <hr className="flex-1 border-t border-border" />
                    <span className="text-text-muted text-sm px-2">o continuá con</span>
                    <hr className="flex-1 border-t border-border" />
                </div>

                <div className="flex gap-4">
                    <Button type="button" variant="google" fullWidth size="md">
                        <span className="font-semibold">G</span> <span className="ml-1">Google</span>
                    </Button>
                    <Button type="button" variant="apple" fullWidth size="md">
                        <span>🍎</span> <span className="ml-1">Apple</span>
                    </Button>
                </div>

                <div className="mt-8 text-center pb-8">
                    <span className="text-text-secondary text-sm">¿No tenés cuenta? </span>
                    <Link 
                        to="/register" 
                        className="text-lime font-bold no-underline"
                    >
                        Registrate
                    </Link>
                </div>
            </form>
        </motion.div>
    )
}
