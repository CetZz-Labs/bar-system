import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type {
  CashierRedemptionAction,
  CashierRedemptionPreview,
  CashierRedemptionValidateResult,
} from "@/types/cashierRedemption";

/**
 * Validación/entrega de canjes por el CAJERO (LB-69). Archivo nuevo,
 * separado de `CashierAPI.ts` (que no toca `Redemption` en absoluto — ver
 * progress/explorers/exp_LB-69.md §9) para no mezclar el dominio de
 * sesión/búsqueda de grupo del cajero con el de canjes.
 *
 * Ruta NO anidada bajo groupId (server.ts monta `/api/redemptions` sin
 * `:groupId`, ver `apps/server/src/routes/cashierRedemptionRoute.ts`): el
 * cajero se identifica por su propia cookie de turno (`withCredentials`,
 * `authenticateCashier`), no por membresía de grupo.
 */

/** Preview de solo lectura: no muta el canje. */
export async function lookupRedemption(tokenOrCode: string) {
  try {
    const { data } = await api.post<CashierRedemptionPreview>(
      `/redemptions/${encodeURIComponent(tokenOrCode)}/lookup`
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function validateRedemption(
  tokenOrCode: string,
  action: CashierRedemptionAction,
  reason?: string
) {
  try {
    const { data } = await api.post<CashierRedemptionValidateResult>(
      `/redemptions/${encodeURIComponent(tokenOrCode)}/validate`,
      { action, reason }
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
