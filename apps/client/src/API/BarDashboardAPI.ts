import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type {
  BarDashboardQuery,
  BarDashboardResponse,
  ResolveDisputeInput,
  ResolveDisputeResponse,
} from "@/types/barDashboard";

/** Dashboard del bar (OWNER, LB-74). */

export async function getBarDashboard(barId: string, query: BarDashboardQuery) {
  try {
    const { data } = await api.get<BarDashboardResponse>(`/bars/${barId}/dashboard`, {
      params: query,
    });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function resolveConsumptionDispute(
  barId: string,
  consumptionId: string,
  body: ResolveDisputeInput
) {
  try {
    const { data } = await api.patch<ResolveDisputeResponse>(
      `/bars/${barId}/consumptions/${consumptionId}/resolve`,
      body
    );
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
