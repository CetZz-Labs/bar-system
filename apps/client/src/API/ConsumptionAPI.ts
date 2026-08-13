import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type {
  ConsumptionConfirmResult,
  ConsumptionLookupResult,
  ConsumptionQrResult,
  ConsumptionRejectResult,
  CreateConsumptionInput,
  PendingConsumption,
} from "@/types/consumption";

export async function createConsumption(outingId: string, input: CreateConsumptionInput) {
  try {
    const { data } = await api.post<ConsumptionQrResult>(`/outings/${outingId}/consumptions`, input);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function regenerateConsumption(outingId: string, consumptionId: string) {
  try {
    const { data } = await api.patch<ConsumptionQrResult>(
      `/outings/${outingId}/consumptions/${consumptionId}/regenerate`
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getPendingConsumptions(outingId: string) {
  try {
    const { data } = await api.get<PendingConsumption[]>(`/outings/${outingId}/consumptions/pending`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

/** LB-61 — líder: lookup por QR JWT o código manual */
export async function lookupConsumption(tokenOrCode: string) {
  try {
    const { data } = await api.post<ConsumptionLookupResult>("/consumptions/lookup", {
      tokenOrCode,
    });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function acceptConsumption(consumptionId: string) {
  try {
    const { data } = await api.post<ConsumptionConfirmResult>(
      `/consumptions/${consumptionId}/accept`
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function rejectConsumption(consumptionId: string) {
  try {
    const { data } = await api.post<ConsumptionRejectResult>(
      `/consumptions/${consumptionId}/reject`
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
