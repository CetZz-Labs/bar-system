import { useCashierAuth } from "@/hooks/useCashierAuth";
import { Outlet, Navigate, useParams } from "react-router";

export default function CashierLayout() {
    const { barId } = useParams<{ barId: string }>()
    const { data, isLoading, autoClosedRecovery } = useCashierAuth(barId)

    if (isLoading) return <div>Loading...</div>

    if (autoClosedRecovery) {
        return (
            <Navigate
                to={`/bar/${barId}/cajero/cierre/${autoClosedRecovery.shiftId}`}
                state={{ summary: autoClosedRecovery.summary }}
                replace
            />
        )
    }

    if (!data) return <Navigate to={`/bar/${barId}/cajero/login`} />

    return <Outlet />
}
