import type {
    CashierCloseShiftResponse,
    CashierLoginForm,
    CashierSearchExactError,
    CashierSearchResult,
    CashierSession,
    CashierShiftSummaryResponse,
} from "@/types/cashier";
import type { Outing } from "@/types/outing";
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

export async function closeCashierShift(): Promise<CashierCloseShiftResponse> {
    try {
        const { data } = await api.post<CashierCloseShiftResponse>('/cashier/shift/close');
        return data;
    } catch (error) {
        return throwStandardError(error);
    }
}

export async function getShiftSummary(shiftId: string): Promise<CashierShiftSummaryResponse> {
    try {
        const { data } = await api.get<CashierShiftSummaryResponse>(`/cashier/shifts/${shiftId}/summary`);
        return data;
    } catch (error) {
        return throwStandardError(error);
    }
}

export async function getPendingShiftSummary(): Promise<CashierShiftSummaryResponse> {
    try {
        const { data } = await api.get<CashierShiftSummaryResponse>('/cashier/shifts/pending-summary');
        return data;
    } catch (error) {
        return throwStandardError(error);
    }
}

export async function downloadShiftSummaryPdf(shiftId: string): Promise<Blob> {
    try {
        const { data } = await api.get<Blob>(`/cashier/shifts/${shiftId}/summary/pdf`, {
            responseType: 'blob',
        });
        return data;
    } catch (error) {
        return throwStandardError(error);
    }
}

export async function downloadShiftSummaryCsv(shiftId: string): Promise<Blob> {
    try {
        const { data } = await api.get<Blob>(`/cashier/shifts/${shiftId}/summary/csv`, {
            responseType: 'blob',
        });
        return data;
    } catch (error) {
        return throwStandardError(error);
    }
}

/** Confirma el check-in de una salida (LB-55). El líder/co-líder recibe una notificación in-app. */
export async function confirmCheckIn(outingId: string) {
    try {
        const { data } = await api.patch<Outing>(`/outings/${outingId}/check-in`);
        return data;
    } catch (error) {
        throwStandardError(error);
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
        return throwStandardError(error);
    }
}
