import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { cashierLogout, cashierSession } from "@/API/CashierAPI";

export const useCashierAuth = (barId: string | undefined) => {
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
            navigate(`/bar/${barId}/cajero/login`);
        },
        onError: () => {
            queryClient.setQueryData(['cashier-session'], null);
            navigate(`/bar/${barId}/cajero/login`);
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
