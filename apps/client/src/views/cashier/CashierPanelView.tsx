import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { motion } from "motion/react"
import { AlertTriangle, Clock, Search, Store, UserCog, Gift } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { closeCashierShift } from "@/API/CashierAPI"
import { useCashierAuth } from "@/hooks/useCashierAuth"
import { toastApiError } from "@/utils/apiError"

export default function CashierPanelView() {
    const { barId } = useParams<{ barId: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { data } = useCashierAuth()
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)

    const closeShiftMutation = useMutation({
        mutationFn: closeCashierShift,
        onSuccess: (result) => {
            if (!result || !barId) return
            queryClient.setQueryData(['cashier-session'], null)
            toast.success('Turno cerrado correctamente')
            navigate(`/bar/${barId}/cajero/cierre/${result.shiftId}`, {
                state: { summary: result.summary },
                replace: true,
            })
        },
        onError: toastApiError,
    })

    const shiftStartedAt = data?.shift.startedAt
        ? new Date(data.shift.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : '—'

    const roleLabel = data?.role === 'OWNER' ? 'Dueño' : 'Cajero'

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

            <div className="flex flex-col gap-4 flex-1">
                <div className="rounded-md border border-border bg-surface-2 p-5">
                    <h2 className="text-xl font-display font-bold text-text-primary mb-1">
                        {data?.bar.name}
                    </h2>
                    <p className="text-text-secondary text-sm">
                        Turno abierto por {data?.user.name} {data?.user.lastName}
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2 p-4">
                        <UserCog size={20} className="text-lime" />
                        <div>
                            <p className="text-text-secondary text-sm">Rol</p>
                            <p className="text-text-primary font-medium">{roleLabel}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2 p-4">
                        <Clock size={20} className="text-lime" />
                        <div>
                            <p className="text-text-secondary text-sm">Turno iniciado</p>
                            <p className="text-text-primary font-medium">{shiftStartedAt}</p>
                        </div>
                    </div>
                </div>

                <Link to={`/bar/${barId}/cajero/buscar`} className="mt-2">
                    <Button type="button" variant="primary" size="lg" fullWidth>
                        <Search size={20} />
                        Buscar grupo
                    </Button>
                </Link>

                <Link to={`/bar/${barId}/cajero/canjes`}>
                    <Button type="button" variant="outline" size="lg" fullWidth>
                        <Gift size={20} />
                        Validar canje
                    </Button>
                </Link>
            </div>

            <Button
                type="button"
                variant="danger"
                size="lg"
                fullWidth
                className="mt-6"
                onClick={() => setIsCloseModalOpen(true)}
                disabled={closeShiftMutation.isPending}
            >
                CERRAR TURNO
            </Button>

            <Modal
                isOpen={isCloseModalOpen}
                onClose={() => setIsCloseModalOpen(false)}
                onConfirm={() => closeShiftMutation.mutate()}
                title="¿Cerrar turno?"
                description="El cierre no bloquea consumos pendientes o en disputa: quedarán reflejados en el resumen para su seguimiento. ¿Querés cerrar el turno ahora?"
                confirmText="Cerrar turno"
                cancelText="Seguir trabajando"
                isPending={closeShiftMutation.isPending}
            >
                <div className="mt-4 flex items-start gap-2 rounded-md border border-error-border bg-error-dim p-3 text-sm text-error" role="alert">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>Los consumos pendientes o en disputa no impiden cerrar el turno.</span>
                </div>
            </Modal>
        </motion.div>
    )
}
