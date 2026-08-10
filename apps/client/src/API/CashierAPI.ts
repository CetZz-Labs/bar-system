import type {
    CashierLoginForm,
    CashierSearchExactError,
    CashierSearchResult,
    CashierSession,
} from "@/types/cashier";
import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";

export async function cashierLogin(formData: CashierLoginForm) {
    try {
        const url = '/cashier/login'
        const { data } = await api.post<string>(url, formData)
        return data
    } catch (error) {
        throwStandardError(error)
    }
}

export async function cashierSession() {
    try {
        const url = '/cashier/session'
        const { data } = await api.get<CashierSession>(url)
        return data
    } catch (error) {
        throwStandardError(error)
    }
}

export async function cashierLogout() {
    try {
        const url = '/cashier/logout'
        const { data } = await api.post<string>(url)
        return data
    } catch (error) {
        throwStandardError(error)
    }
}

/** Preserva códigos de negocio NO_SALIDA / OTHER_BAR (LB-54) */
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
            response?: { data?: CashierSearchExactError & { message?: string } };
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
