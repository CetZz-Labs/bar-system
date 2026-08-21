import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { cashierLogout, cashierSession } from "@/API/CashierAPI";
import type { CashierShiftSummary, CashierShiftSummaryRecovery } from "@/types/cashier";
import type { ApiError } from "@/utils/apiError";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isCashierShiftSummary(value: unknown): value is CashierShiftSummary {
    if (!isRecord(value)) return false;

    return (
        (value.status === "PENDING" || value.status === "VIEWED") &&
        typeof value.totalConsumptions === "number" &&
        typeof value.confirmedConsumptions === "number" &&
        typeof value.pendingConsumptions === "number" &&
        typeof value.rejectedConsumptions === "number" &&
        typeof value.disputedConsumptions === "number" &&
        typeof value.totalAmount === "number" &&
        typeof value.pointsAwarded === "number" &&
        typeof value.redemptionCount === "number" &&
        typeof value.redemptionsAvailable === "boolean" &&
        typeof value.generatedAt === "string"
    );
}

function getAutoClosedRecovery(error: unknown): CashierShiftSummaryRecovery | null {
    if (!isRecord(error) || error.type !== "server") return null;

    const apiError = error as ApiError & { type: "server" };
    if (
        apiError.code !== "SHIFT_AUTO_CLOSED" ||
        typeof apiError.shiftId !== "string" ||
        !isCashierShiftSummary(apiError.summary)
    ) {
        return null;
    }

    return { shiftId: apiError.shiftId, summary: apiError.summary };
}

// LB-66: la sesión de cajero se guarda en el mismo cookie único `access_token`
// que la sesión de usuario normal (ver ContextController). `cashierSession`
// (GET /cashier/session) sigue siendo la fuente de verdad de esta sesión —
// no cambió, solo cambió de qué cookie la lee el middleware del backend.
export const useCashierAuth = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const sessionQuery = useQuery({
        queryKey: ['cashier-session'],
        queryFn: cashierSession,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 30
    })

    const { data, isError, isLoading } = sessionQuery
    const autoClosedRecovery = getAutoClosedRecovery(sessionQuery.error)

    const { mutate } = useMutation({
        mutationFn: cashierLogout,
        onSuccess: () => {
            queryClient.setQueryData(['cashier-session'], null);
            // El login separado de cajero (/bar/:barId/cajero/login) ya no
            // existe (LB-66): cerrar el turno limpia el cookie único
            // compartido, así que la única sesión que queda para recuperar
            // es la de usuario normal, vía /login.
            queryClient.setQueryData(['session'], null);
            navigate('/login');
        },
        onError: () => {
            queryClient.setQueryData(['cashier-session'], null);
            queryClient.setQueryData(['session'], null);
            navigate('/login');
        }
    })

    const logoutCashier = () => mutate()

    return {
        data: data || null,
        isError,
        isLoading,
        autoClosedRecovery,
        logoutCashier
    }
}
