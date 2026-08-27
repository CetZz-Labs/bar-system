import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, useLocation, useNavigate } from "react-router"
import { motion } from "motion/react"
import { ArrowRight, Store, User as UserIcon, Zap } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Spinner"
import { useAuth } from "@/hooks/useAuth"
import { getContextOptions, selectContext } from "@/API/ContextAPI"
import { cashierSession } from "@/API/CashierAPI"
import { getDeviceInfo } from "@/utils/device"
import { toastApiError } from "@/utils/apiError"
import type { ContextBarOption, ContextMode } from "@/types/context"

type LocationState = { from?: string } | null

/**
 * Selector de contexto post-login (LB-24/LB-66). Se navega acá
 * explícitamente desde LoginView cuando el usuario tiene más de una opción
 * de contexto disponible (usuario / cajero de un bar / dueño de un bar).
 * Si solo tiene la opción "usuario" (sin ningún BarUser activo), LoginView
 * ni siquiera navega hasta acá — y si de todos modos se llega por URL
 * directa, este componente hace el mismo salto automático.
 */
export default function SelectContextView() {
    const { data: user, isLoading: isAuthLoading, isProfileComplete } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const queryClient = useQueryClient()
    const fromState = (location.state as LocationState)?.from

    const { data: options, isLoading: isOptionsLoading } = useQuery({
        queryKey: ['context-options'],
        queryFn: getContextOptions,
        enabled: !!user && isProfileComplete,
        retry: false,
    })

    const { mutate, isPending } = useMutation({
        mutationFn: selectContext,
        onSuccess: async (data, variables) => {
            if (!data) return
            if (variables.mode === 'user') {
                navigate(fromState || '/', { replace: true })
                return
            }
            // El access_token ya trae el turno recién abierto (ver
            // ContextController.select); precargamos ['cashier-session']
            // para que CashierLayout/useCashierAuth no dependan de un
            // refetch en caliente al montar.
            const cashierData = await cashierSession()
            queryClient.setQueryData(['cashier-session'], cashierData)
            navigate(`/bar/${variables.barId}/cajero`, { replace: true })
        },
        onError: toastApiError,
    })

    if (isAuthLoading) return <div className="flex min-h-[100dvh] items-center justify-center"><Spinner size="lg" /></div>
    if (!user) return <Navigate to="/login" replace />
    if (!isProfileComplete) return <Navigate to="/onboarding" replace />
    if (isOptionsLoading) return <div className="flex min-h-[100dvh] items-center justify-center"><Spinner size="lg" /></div>

    const hasBarRoles = !!options && (options.cashier.length > 0 || options.owner.length > 0)
    if (!hasBarRoles) {
        return <Navigate to={fromState || '/'} replace />
    }

    const handleSelect = (mode: ContextMode, barId?: string) => {
        mutate({ mode, barId, deviceInfo: getDeviceInfo() })
    }

    const renderBarOption = (mode: ContextMode, bar: ContextBarOption, label: string) => (
        <Button
            key={`${mode}-${bar.barId}`}
            type="button"
            variant="surface"
            size="lg"
            fullWidth
            disabled={isPending}
            onClick={() => handleSelect(mode, bar.barId)}
        >
            <Store size={20} className="text-lime" />
            <span className="flex-1 text-left">{label} de {bar.barName}</span>
            <ArrowRight size={18} />
        </Button>
    )

    return (
        <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col flex-1 pb-nav pt-5 px-4 h-full"
        >
            <header className="flex items-center gap-2 mb-10 mt-4">
                <div className="flex items-center justify-center p-1 rounded-md bg-lime">
                    <Zap size={24} className="text-bg fill-bg" strokeWidth={2.5} />
                </div>
                <span className="font-display font-bold text-[20px]">La Banda</span>
            </header>

            <div className="mb-10">
                <h1 className="mb-2">¿Cómo querés entrar?</h1>
                <p className="text-text-secondary text-base">
                    Elegí con qué rol continuar en esta sesión
                </p>
            </div>

            <div className="flex flex-col gap-3 flex-1">
                <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={isPending}
                    onClick={() => handleSelect('user')}
                >
                    <UserIcon size={20} className="text-bg" />
                    Continuar como usuario
                    <ArrowRight size={18} className="text-bg" />
                </Button>

                {options?.cashier.map((bar) => renderBarOption('cashier', bar, 'Cajero'))}
                {options?.owner.map((bar) => renderBarOption('owner', bar, 'Dueño'))}
            </div>
        </motion.div>
    )
}
