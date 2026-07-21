import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { Group, GroupDetail, GroupInviteInfo, GroupJoinRequest } from "@/types/group";

// Return type omitted intentionally: throwStandardError returns never, but TS 5.9
// flags the catch-only-throw path as lacking a return statement when an explicit
// Promise<T> type is declared. UserAPI.ts follows the same pattern.
export async function createGroup(formData: FormData) {
  try {
    const { data } = await api.post<Group>("/groups", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getGroupBySlug(slug: string) {
  try {
    const { data } = await api.get<GroupDetail>(`/groups/${slug}`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getGroupByInviteCode(inviteCode: string) {
  try {
    const { data } = await api.get<GroupInviteInfo>(`/groups/invite/${inviteCode}`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export type JoinGroupResponse =
  | { message: string; group: { id: string; name: string; slug: string } }
  | { message: string; status: "pending" };

export async function joinGroup(inviteCode: string) {
  try {
    const { data } = await api.post<JoinGroupResponse>("/groups/join", { inviteCode });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getGroupRequests(slug: string) {
  try {
    const { data } = await api.get<GroupJoinRequest[]>(`/groups/${slug}/requests`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function approveGroupRequest(slug: string, requestId: string) {
  try {
    const { data } = await api.post<{ message: string }>(`/groups/${slug}/requests/${requestId}/approve`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function rejectGroupRequest(slug: string, requestId: string) {
  try {
    const { data } = await api.post<{ message: string }>(`/groups/${slug}/requests/${requestId}/reject`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export function getGroupQRUrl(slug: string): string {
  return `${api.defaults.baseURL}/groups/${slug}/qr`;
}
