import { z } from "zod";
import type { Auth } from "./auth";

export const updateProfileSchema = z.object({
    name: z.string().min(2, "Mínimo 2 caracteres"),
    lastName: z.string().min(2, "Mínimo 2 caracteres"),
    birthdate: z.string().optional()
});

export type UpdateProfileDataType = z.infer<typeof updateProfileSchema>;

export const onboardingSchema = z.object({
    fullName: z
        .string()
        .min(1, "Ingresá tu nombre completo")
        .refine(
            (val) => val.trim().split(/\s+/).length >= 2,
            "Ingresá nombre y apellido"
        )
        .refine(
            (val) => val.trim().length <= 50,
            "Máximo 50 caracteres"
        ),
    birthdate: z.string().min(1, "La fecha de nacimiento es requerida"),
});

export type OnboardingDataType = z.infer<typeof onboardingSchema>;

export interface GroupMembership {
    groupId: string;
    slug: string;
    name: string;
    avatarUrl?: string;
    role: 'admin' | 'member' | 'moderator';
}

export interface UserGroup {
    groups: GroupMembership[];
}

export interface AvatarUploadResponse {
    avatarUrl: string;
}

export interface UserProfile extends Auth {
    _id: string;
    avatarUrl?: string;
    isActive: boolean;
    role: string;
    createdAt: string;
    updatedAt: string;
    memberships?: GroupMembership[];
}
