import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logout, session } from "@/API/AuthAPI";

export const useAuth = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const { data, isError, isLoading } = useQuery({
        queryKey: ['session'],
        queryFn: session,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5
    })

    const { mutate } = useMutation({
        mutationFn: logout,
        onSuccess: () => {
            queryClient.setQueryData(['session'], null);
            navigate('/login');
        },
        onError: () => {
            queryClient.setQueryData(['session'], null);
            navigate('/login');
        }
    })

    const logoutUser = () => mutate()

    const isProfileComplete = !!data?.profileComplete

    return {
        data: data || null,
        isError,
        isLoading,
        logoutUser,
        isProfileComplete
    }
} 