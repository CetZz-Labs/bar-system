import type { CashierLoginForm, CashierSession } from "@/types/cashier";
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
