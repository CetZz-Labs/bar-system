import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { CreateRewardInput, GroupRewardsAvailability, Reward, UpdateRewardInput } from "@/types/reward";

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

/**
 * LB-72: recompensas disponibles + saldo de puntos del grupo en el bar del
 * check-in activo, en un solo round-trip. El backend resuelve el bar
 * internamente vía la salida ACTIVE del grupo (no confía en `barId` del
 * cliente) — no lo mandamos como query param.
 */
export async function getGroupRewards(groupId: string) {
  try {
    const { data } = await api.get<GroupRewardsAvailability>(`/groups/${groupId}/rewards`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

/**
 * LB-76: recompensas activas y disponibles de un bar, resueltas directo del
 * `barId` (sin pasar por groupId/Outing como `getGroupRewards`). Accesible
 * por cualquier cliente autenticado sin necesidad de check-in activo.
 */
export async function getAvailableRewardsForBar(barId: string) {
  try {
    const { data } = await api.get<Reward[]>(`/bar/${barId}/rewards/available`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
