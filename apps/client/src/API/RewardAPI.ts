import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { CreateRewardInput, Reward, UpdateRewardInput } from "@/types/reward";

/** ABM de recompensas del bar (LB-67). GET/PUT/DELETE de canje (LB-68/LB-69)
 * quedan fuera de alcance. */

export async function getBarRewards(barId: string) {
  try {
    const { data } = await api.get<Reward[]>(`/bars/${barId}/rewards`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function createReward(barId: string, body: CreateRewardInput) {
  try {
    const { data } = await api.post<Reward>(`/bars/${barId}/rewards`, body);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function updateReward(barId: string, rewardId: string, body: UpdateRewardInput) {
  try {
    const { data } = await api.put<Reward>(`/bars/${barId}/rewards/${rewardId}`, body);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function deleteReward(barId: string, rewardId: string) {
  try {
    const { data } = await api.delete<{ message: string }>(`/bars/${barId}/rewards/${rewardId}`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
