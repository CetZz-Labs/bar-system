import { useParams } from "react-router"
import { motion } from "motion/react"
import { LogOut, Store, Clock, UserCog } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { useCashierAuth } from "@/hooks/useCashierAuth"

export default function CashierPanelView() {
    const { barId } = useParams<{ barId: string }>()
    const { data, logoutCashier } = useCashierAuth(barId)

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

                <p className="text-text-muted text-sm mt-4">
                    La gestión de puntos y consumos estará disponible próximamente.
                </p>
            </div>

            <Button
                type="button"
                variant="danger"
                size="lg"
                fullWidth
                className="mt-6"
                onClick={logoutCashier}
            >
                <LogOut size={20} />
                CERRAR TURNO
            </Button>
        </motion.div>
    )
}
