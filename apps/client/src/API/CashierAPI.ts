import api from '@/libs/axios';
import { throwStandardError } from '@/utils/apiError';
import type {
  CashierSearchExactError,
  CashierSearchResult,
  CashierSession,
} from '@/types/cashier';

export async function cashierLogin(payload: {
  email: string;
  password: string;
  barId: string;
}) {
  try {
    const { data } = await api.post('/cashier/login', payload);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function cashierLogout() {
  try {
    const { data } = await api.post('/cashier/logout');
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getCashierSession() {
  try {
    const { data } = await api.get<CashierSession>('/cashier/session');
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

/** Preserva códigos de negocio NO_SALIDA / OTHER_BAR del search */
export async function searchCashierGroupsRaw(q: string): Promise<
  | { ok: true; results: CashierSearchResult[] }
  | { ok: false; error: CashierSearchExactError }
> {
  try {
    const { data } = await api.get<{ results: CashierSearchResult[] }>(
      '/cashier/groups/search',
      { params: { q } }
    );
    return { ok: true, results: data.results };
  } catch (error: unknown) {
    const axiosLike = error as {
      response?: { status?: number; data?: CashierSearchExactError & { message?: string } };
    };
    const data = axiosLike.response?.data;
    if (data?.code === 'NO_SALIDA' || data?.code === 'OTHER_BAR') {
      return {
        ok: false,
        error: {
          code: data.code,
          message: data.message,
          otherBarName: data.otherBarName,
        },
      };
    }
    throwStandardError(error);
  }
}
