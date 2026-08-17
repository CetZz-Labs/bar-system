import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { Redemption, RedemptionQrResult } from "@/types/redemption";

/**
 * Canje de recompensas del líder (LB-68). El backend resuelve el bar/
 * check-in internamente (mismo criterio que RewardAPI.getGroupRewards) —
 * el cliente solo manda `rewardId`.
 */

export async function createRedemption(groupId: string, rewardId: string) {
  try {
    const { data } = await api.post<RedemptionQrResult>(`/groups/${groupId}/redemptions`, { rewardId });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function cancelRedemption(groupId: string, redemptionId: string) {
  try {
    const { data } = await api.patch<Redemption>(`/groups/${groupId}/redemptions/${redemptionId}/cancel`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getGroupRedemptions(groupId: string) {
  try {
    const { data } = await api.get<Redemption[]>(`/groups/${groupId}/redemptions`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
