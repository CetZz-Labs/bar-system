import { useState } from "react"
import { Register } from "@/API/AuthAPI"
import type { Auth } from "@/types/auth"
import { toastApiError } from "@/utils/apiError"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import { motion, AnimatePresence } from "motion/react"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Check, Zap } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

export default function RegisterView() {
    const navigate = useNavigate()
    const [step, setStep] = useState(1)
    const [showPassword, setShowPassword] = useState(false)

    // Extended auth type just for the form
    type RegisterForm = Auth & { fullName?: string, phone?: string, referralCode?: string }
    
    const defaultValues: RegisterForm = {
        name: "",
        lastName: "",
        fullName: "",
        phone: "",
        email: "",
        password: "",
        confirmPassword: "",
        referralCode: ""
    }

    const { register, handleSubmit, trigger, watch, formState: { errors } } = useForm<RegisterForm>({ 
        defaultValues,
        mode: "onChange"
    })

    const { mutate, isPending } = useMutation({
        mutationFn: Register,
        onError: toastApiError,
        onSuccess: (data) => {
            toast.success(data || "Cuenta creada exitosamente")
            navigate("/login")
        }
    })

    const handleNext = async (fieldsToValidate: (keyof RegisterForm)[]) => {
        const isValid = await trigger(fieldsToValidate)
        if (isValid) {
            setStep(prev => prev + 1)
        }
    }

    const onSubmit = (formData: RegisterForm) => {
        // Split full name if present
        if (formData.fullName) {
            const parts = formData.fullName.trim().split(" ")
            formData.name = parts[0]
            formData.lastName = parts.slice(1).join(" ") || "."
        }
        mutate(formData)
    }

    // Watched values for summary in Step 3
    const watchedName = watch("fullName")
    const watchedEmail = watch("email")
    const watchedPhone = watch("phone")

    return (
        <div className="flex flex-col flex-1 pb-nav px-4 pt-5 min-h-[100dvh]">
            
            {/* Header / Steps Indicator */}
            <header className="flex items-center justify-between mb-8">
                {/* Back button */}
                <button 
                    onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)}
                    className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
                >
                    <ArrowLeft size={20} className="text-text-secondary" />
                </button>

                {/* Steps */}
                <div className="flex items-center gap-2">
                    {/* Step 1 */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        step >= 1 ? 'bg-lime text-bg' : 'bg-surface-3 text-text-secondary'
                    }`}>
                        {step > 1 ? <Check size={16} strokeWidth={3} /> : "1"}
                    </div>
                    
                    <div className={`w-8 h-[1px] ${step >= 2 ? 'bg-lime' : 'bg-border'}`} />
                    
                    {/* Step 2 */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        step >= 2 ? 'bg-lime text-bg' : 'bg-surface-3 text-text-secondary border border-border'
                    }`}>
                        {step > 2 ? <Check size={16} strokeWidth={3} /> : "2"}
                    </div>

                    <div className={`w-8 h-[1px] ${step >= 3 ? 'bg-lime' : 'bg-border'}`} />

                    {/* Step 3 */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        step >= 3 ? 'bg-lime text-bg' : 'bg-surface-3 text-text-secondary border border-border'
                    }`}>
                        3
                    </div>
                </div>

                {/* Right Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-lime">
                    <Zap size={20} className="text-bg fill-bg" />
                </div>
            </header>

            {/* Dynamic Content */}
            <div className="flex-1 flex flex-col">
                <AnimatePresence mode="wait">
                    
                    {/* STEP 1 */}
                    {step === 1 && (
                        <motion.div 
                            key="step1"
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -20, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col flex-1"
                        >
                            <h1 className="mb-2">Creá tu cuenta</h1>
                            <p className="text-text-secondary text-base mb-8">Ingresá tus datos para comenzar</p>

                            <div className="w-full h-1 bg-surface-2 rounded-full mb-8 overflow-hidden">
                                <div className="h-full bg-lime w-1/3 rounded-full" />
                            </div>

                            <div className="flex flex-col gap-5">
                                <Input 
                                    label="NOMBRE COMPLETO"
                                    type="text"
                                    placeholder="Alex García"
                                    {...register("fullName", { required: "Ingresá tu nombre completo" })}
                                    error={errors.fullName?.message}
                                />
                                <Input 
                                    label="EMAIL"
                                    type="email"
                                    placeholder="tu@email.com"
                                    {...register("email", { 
                                        required: "Ingresá tu email",
                                        pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: "Email inválido" }
                                    })}
                                    error={errors.email?.message}
                                />
                                <Input 
                                    label="TELÉFONO"
                                    type="tel"
                                    placeholder="+54 11 1234-5678"
                                    {...register("phone", { required: "Ingresá tu teléfono" })}
                                    error={errors.phone?.message}
                                />
                            </div>

                            <div className="mt-auto pt-8 pb-4">
                                <Button 
                                    type="button" 
                                    variant="surface" 
                                    size="lg" 
                                    fullWidth 
                                    onClick={() => handleNext(['fullName', 'email', 'phone'])}
                                    className="bg-surface-2 hover:bg-surface-3 text-white border-0 py-4 font-semibold w-full flex justify-center items-center gap-2 rounded-xl transition-colors"
                                >
                                    <span className="text-text-secondary font-ui font-semibold">CONTINUAR</span> 
                                    <ArrowRight size={20} className="text-text-secondary" />
                                </Button>

                                <div className="mt-6 text-center text-sm">
                                    <span className="text-text-secondary">¿Ya tenés cuenta? </span>
                                    <Link to="/login" className="text-lime font-bold no-underline">
                                        Iniciá sesión
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <motion.div 
                            key="step2"
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -20, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col flex-1"
                        >
                            <h1 className="mb-2">Tu contraseña</h1>
                            <p className="text-text-secondary text-base mb-8">Elegí una contraseña segura</p>

                            <div className="w-full h-1 bg-surface-2 rounded-full mb-8 overflow-hidden">
                                <div className="h-full bg-lime w-2/3 rounded-full" />
                            </div>

                            <div className="flex flex-col gap-5">
                                <Input 
                                    label="CONTRASEÑA"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Mínimo 6 caracteres"
                                    {...register("password", { 
                                        required: "La contraseña es requerida",
                                        minLength: { value: 6, message: "Mínimo 6 caracteres" }
                                    })}
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
                                <Input 
                                    label="CONFIRMÁ LA CONTRASEÑA"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Repetí tu contraseña"
                                    {...register("confirmPassword", { 
                                        required: "Confirmá tu contraseña",
                                        validate: (val: string | undefined) => { 
                                            if (watch('password') != val) {
                                                return "Las contraseñas no coinciden";
                                            }
                                        } 
                                    })}
                                    error={errors.confirmPassword?.message}
                                />
                            </div>

                            <div className="mt-auto pt-8 pb-4">
                                <Button 
                                    type="button" 
                                    variant="surface" 
                                    size="lg" 
                                    fullWidth 
                                    onClick={() => handleNext(['password', 'confirmPassword'])}
                                    className="bg-surface-2 hover:bg-surface-3 text-white border-0 py-4 font-semibold w-full flex justify-center items-center gap-2 rounded-xl transition-colors"
                                >
                                    <span className="text-text-secondary font-ui font-semibold">CONTINUAR</span> 
                                    <ArrowRight size={20} className="text-text-secondary" />
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <motion.div 
                            key="step3"
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -20, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col flex-1"
                        >
                            <h1 className="mb-2">Último paso</h1>
                            <p className="text-text-secondary text-base mb-8">Ya casi terminás</p>

                            <div className="w-full h-1 bg-surface-2 rounded-full mb-8 overflow-hidden">
                                <div className="h-full bg-lime w-full rounded-full" />
                            </div>

                            <div className="flex flex-col gap-6">
                                {/* Summary Card */}
                                <div className="bg-surface-2 border border-border rounded-xl p-5 flex flex-col gap-4">
                                    <span className="overline">RESUMEN</span>
                                    
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-text-secondary">Nombre</span>
                                        <span className="font-medium text-white">{watchedName}</span>
                                    </div>
                                    <div className="h-[1px] w-full bg-border" />
                                    
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-text-secondary">Email</span>
                                        <span className="font-medium text-white">{watchedEmail}</span>
                                    </div>
                                    <div className="h-[1px] w-full bg-border" />

                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-text-secondary">Teléfono</span>
                                        <span className="font-medium text-white">{watchedPhone}</span>
                                    </div>
                                </div>

                                {/* Referral Input */}
                                <div>
                                    <Input 
                                        label="CÓDIGO DE REFERIDO (OPCIONAL)"
                                        type="text"
                                        placeholder="NIGHTOUT123"
                                        {...register("referralCode")}
                                    />
                                    <p className="text-text-muted text-xs mt-2 pl-1">Si alguien te invitó, ingresá su código para bonus extra</p>
                                </div>

                                {/* Welcome Bonus Card */}
                                <div className="bg-lime-dim border border-lime-border rounded-xl p-4 flex gap-4 items-center">
                                    <div className="text-2xl pt-1">🎁</div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-lime font-bold font-ui">Bonus de bienvenida</span>
                                        <span className="text-text-secondary text-sm">+200 puntos al crear tu cuenta</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto pt-8 pb-4">
                                <p className="text-text-secondary text-center text-xs px-4 mb-6 leading-relaxed">
                                    Al registrarte aceptás los <span className="text-lime">Términos y condiciones</span> y la <span className="text-lime">Política de privacidad</span>
                                </p>
                                
                                <Button 
                                    type="button" 
                                    variant="primary" 
                                    size="lg" 
                                    fullWidth 
                                    onClick={handleSubmit(onSubmit)}
                                    disabled={isPending}
                                >
                                    {isPending ? "CREANDO..." : "CREAR CUENTA"} 
                                    {!isPending && <ArrowRight size={20} className="text-bg" />}
                                </Button>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>

        </div>
    )
}
