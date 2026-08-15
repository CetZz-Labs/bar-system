import { useCashierAuth } from "@/hooks/useCashierAuth";
import { Outlet, Navigate } from "react-router";

// LB-66: ya no existe un login separado de cajero
// (/bar/:barId/cajero/login) — la sesión de cajero se obtiene eligiendo
// el contexto "cajero"/"dueño" en /select-context después del login
// unificado. Si no hay sesión de cajero activa (turno cerrado, token
// vencido, o el usuario nunca eligió ese contexto), lo mandamos a /login;
// desde ahí, si vuelve a loguearse, el selector de contexto lo va a
// dejar reabrir el turno para este bar.
export default function CashierLayout() {
    const { data, isLoading } = useCashierAuth()

    if (isLoading) return <div>Loading...</div>

    if (!data) return <Navigate to="/login" />

    return <Outlet />
}
