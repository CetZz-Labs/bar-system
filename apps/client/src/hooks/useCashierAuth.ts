import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  cashierLogin,
  cashierLogout,
  getCashierSession,
} from '@/API/CashierAPI';
import { toastApiError } from '@/utils/apiError';
import { toast } from 'sonner';

export function useCashierAuth(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sessionQuery = useQuery({
    queryKey: ['cashierSession'],
    queryFn: getCashierSession,
    retry: false,
    refetchOnWindowFocus: false,
    enabled: options?.enabled !== false,
  });

  const loginMutation = useMutation({
    mutationFn: cashierLogin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashierSession'] });
      toast.success('Sesión de cajero iniciada');
      navigate('/cashier');
    },
    onError: toastApiError,
  });

  const logoutMutation = useMutation({
    mutationFn: cashierLogout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['cashierSession'] });
      navigate('/cashier/login');
    },
    onError: toastApiError,
  });

  return {
    session: sessionQuery.data,
    isLoading: sessionQuery.isLoading,
    isError: sessionQuery.isError,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}
