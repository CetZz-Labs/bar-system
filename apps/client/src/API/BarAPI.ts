import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { CreateBarFormData, EditBarProfileFormData, MyBar, RegisterBarResponse } from "@/types/bar";
import type { Bar } from "@/types/bar";

export async function registerBar(body: CreateBarFormData) {
  try {
    const { data } = await api.post<RegisterBarResponse>("/bar/registro", body);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getMyBars() {
  try {
    const { data } = await api.get<MyBar[]>("/bar/mis-bares");
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function getBarProfile(id: string) {
  try {
    const { data } = await api.get<Bar>(`/bar/${id}/perfil`);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function updateBarProfile(id: string, body: EditBarProfileFormData) {
  try {
    const { data } = await api.patch<{ message: string }>(`/bar/${id}/perfil`, body);
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function uploadBarLogo(id: string, file: File) {
  try {
    const formData = new FormData();
    formData.append("logo", file);
    const { data } = await api.post<{ logoUrl: string }>(`/bar/${id}/logo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}

export async function uploadBarCover(id: string, file: File) {
  try {
    const formData = new FormData();
    formData.append("cover", file);
    const { data } = await api.post<{ coverUrl: string }>(`/bar/${id}/cover`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (error) {
    throwStandardError(error);
  }
}
