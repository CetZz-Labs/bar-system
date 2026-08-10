import { useCashierAuth } from "@/hooks/useCashierAuth";
import { Outlet, Navigate, useParams } from "react-router";

export default function CashierLayout() {
    const { barId } = useParams<{ barId: string }>()
    const { data, isLoading } = useCashierAuth(barId)

    if (isLoading) return <div>Loading...</div>

    if (!data) return <Navigate to={`/bar/${barId}/cajero/login`} />

    return <Outlet />
}
