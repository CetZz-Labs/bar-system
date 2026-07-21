import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type { UpdateProfileDataType, UserProfile, GroupMembership, AvatarUploadResponse } from "@/types/user";

export async function getUserProfile() {
    try {
        const url = '/users/profile';
        const { data } = await api.get<UserProfile>(url);

        return data;
    } catch (error) {
        throwStandardError(error);
    }
}

export async function updateUserProfile(formData: UpdateProfileDataType) {
    try {
        const url = '/users/profile';
        const { data } = await api.put<string>(url, formData);
        return data;
    } catch (error) {
        throwStandardError(error);
    }
}

export async function uploadAvatar(file: File) {
    try {
        const formData = new FormData();
        formData.append("avatar", file);
        const { data } = await api.post<AvatarUploadResponse>("/users/avatar", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return data;
    } catch (error) {
        throwStandardError(error);
    }
}

export async function getUserGroups() {
    try {
        const { data } = await api.get<GroupMembership[]>('/users/groups');
        return data;
    } catch (error) {
        throwStandardError(error);
    }
}
