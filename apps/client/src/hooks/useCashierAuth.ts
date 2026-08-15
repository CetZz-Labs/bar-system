import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { cashierLogout, cashierSession } from "@/API/CashierAPI";

// LB-66: la sesión de cajero se guarda en el mismo cookie único `access_token`
// que la sesión de usuario normal (ver ContextController). `cashierSession`
// (GET /cashier/session) sigue siendo la fuente de verdad de esta sesión —
// no cambió, solo cambió de qué cookie la lee el middleware del backend.
export const useCashierAuth = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const { data, isError, isLoading } = useQuery({
        queryKey: ['cashier-session'],
        queryFn: cashierSession,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 30
    })

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
        logoutCashier
    }
}
