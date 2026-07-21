import { z } from "zod";

export const GROUP_TYPES = ["OPEN", "CLOSED"] as const;
export type GroupType = typeof GROUP_TYPES[number];

export const GROUP_ROLES = ["LEADER", "CO_LEADER", "MEMBER"] as const;
export type GroupRole = typeof GROUP_ROLES[number];

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(40, "Máximo 40 caracteres")
    .regex(/^[a-zA-Z0-9\s-]+$/, "Solo letras, números, espacios y guiones"),
  description: z
    .string()
    .max(120, "Máximo 120 caracteres")
    .optional()
    .or(z.literal("")),
  type: z.enum(GROUP_TYPES, { message: "Seleccioná un tipo" }),
});

export type CreateGroupFormData = z.infer<typeof createGroupSchema>;

export interface Group {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  type: GroupType;
  avatarUrl?: string;
  inviteCode: string;
  leader: string;
  memberships: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: GroupRole;
}

export interface GroupDetail {
  id: string;
  name: string;
  slug: string;
  type: GroupType;
  description: string;
  avatarUrl: string;
  memberCount: number;
  members: GroupMember[];
  inviteCode?: string;
  inviteLink?: string;
  canManage: boolean;
  currentUserRole: GroupRole;
  pendingRequestsCount?: number;
}

export type GroupUserStatus = "member" | "banned" | "pending" | "available";

export interface GroupInviteInfo {
  id: string;
  name: string;
  slug: string;
  type: GroupType;
  description: string;
  avatarUrl: string;
  memberCount: number;
  inviteCode: string;
  userStatus?: GroupUserStatus;
  message?: string;
}

export interface GroupRequestUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface GroupJoinRequest {
  id: string;
  user: GroupRequestUser;
  createdAt: string;
}
