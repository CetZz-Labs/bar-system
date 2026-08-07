import { isAxiosError } from "axios";
import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { CreateOutingInput, Outing, UpdateOutingInput } from "@/types/outing";

// Thrown when POST /outings fails because the group already has an active outing.
export interface OutingConflictError {
  type: "server";
  message: string;
  status: 409;
  existingOutingId?: string;
}

export async function createOuting(groupId: string, input: CreateOutingInput) {
  try {
    const { data } = await api.post<Outing>(`/groups/${groupId}/outings`, input);
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 409) {
      const body = error.response.data as { message?: string; existingOutingId?: string };
      const conflict: OutingConflictError = {
        type: "server",
        message: body.message ?? "El grupo ya tiene una salida activa.",
        status: 409,
        existingOutingId: body.existingOutingId,
      };
      throw conflict;
    }
    throwStandardError(error);
  }
}

export async function updateOuting(groupId: string, outingId: string, input: UpdateOutingInput) {
  try {
    const { data } = await api.patch<Outing>(`/groups/${groupId}/outings/${outingId}`, input);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function cancelOuting(groupId: string, outingId: string) {
  try {
    const { data } = await api.patch<Outing>(`/groups/${groupId}/outings/${outingId}/cancel`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

// Returns the group's active/pending outing, or null when it has none (404).
export async function getActiveOuting(groupId: string) {
  try {
    const { data } = await api.get<Outing>(`/groups/${groupId}/outings/active`);
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throwStandardError(error);
  }
}
