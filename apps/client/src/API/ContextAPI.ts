import type { ContextOptions, SelectContextPayload, SelectContextResponse } from "@/types/context";
import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";

/** GET /api/context/options — opciones de contexto disponibles para el usuario logueado (LB-66). */
export async function getContextOptions() {
    try {
        const url = '/context/options'
        const { data } = await api.get<ContextOptions>(url)
        return data
    } catch (error) {
        throwStandardError(error)
    }
}

/** POST /api/context/select — re-emite el access_token unificado según el contexto elegido (LB-66). */
export async function selectContext(payload: SelectContextPayload) {
    try {
        const url = '/context/select'
        const { data } = await api.post<SelectContextResponse>(url, payload)
        return data
    } catch (error) {
        throwStandardError(error)
    }
}
