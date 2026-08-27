import { useCashierAuth } from "@/hooks/useCashierAuth";
import { Outlet, Navigate, useParams } from "react-router";
import { Spinner } from "@/components/ui/Spinner";

// LB-66: ya no existe un login separado de cajero
// (/bar/:barId/cajero/login) — la sesión de cajero se obtiene eligiendo
// el contexto "cajero"/"dueño" en /select-context después del login
// unificado. Si no hay sesión de cajero activa (turno cerrado, token
// vencido, o el usuario nunca eligió ese contexto), lo mandamos a /login;
// desde ahí, si vuelve a loguearse, el selector de contexto lo va a
// dejar reabrir el turno para este bar.
export default function CashierLayout() {
    const { barId } = useParams<{ barId: string }>()
    const { data, isLoading, autoClosedRecovery } = useCashierAuth()

    if (isLoading) {
        return (
            <div className="flex min-h-[100dvh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    // LB-73: el turno se cerró automáticamente al horario de cierre del bar.
    // En vez de expulsar al cajero, lo llevamos a la pantalla de resumen del
    // turno que quedó cerrado para que pueda ver/descargar su cierre.
    if (autoClosedRecovery && barId) {
        return (
            <Navigate
                to={`/bar/${barId}/cajero/cierre/${autoClosedRecovery.shiftId}`}
                state={{ summary: autoClosedRecovery.summary }}
                replace
            />
        )
    }

    if (!data) return <Navigate to="/login" />

    return <Outlet />
}
