import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { GroupBalance, GroupHistoryPage } from "@/types/points";

export async function getGroupBalance(groupId: string) {
  try {
    const { data } = await api.get<GroupBalance>(`/groups/${groupId}/balance`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getGroupHistory(groupId: string, cursor?: string | null, limit = 20) {
  try {
    const { data } = await api.get<GroupHistoryPage>(`/groups/${groupId}/history`, {
      params: {
        ...(cursor ? { cursor } : {}),
        limit,
      },
    });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
