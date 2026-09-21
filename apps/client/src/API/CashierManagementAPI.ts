import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { Cashier, CreateCashierInput, UpdateCashierInput } from "@/types/cashierManagement";

/** ABM de cajeros del bar (LB-115). */

export async function getBarCashiers(barId: string) {
  try {
    const { data } = await api.get<Cashier[]>(`/bars/${barId}/cashiers`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function createCashier(barId: string, body: CreateCashierInput) {
  try {
    const { data } = await api.post<Cashier>(`/bars/${barId}/cashiers`, body);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function updateCashier(barId: string, cashierId: string, body: UpdateCashierInput) {
  try {
    const { data } = await api.put<Cashier>(`/bars/${barId}/cashiers/${cashierId}`, body);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
