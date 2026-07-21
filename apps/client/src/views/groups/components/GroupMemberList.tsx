import { Crown, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { GroupMember, GroupRole } from "@/types/group";

interface GroupMemberListProps {
  members: GroupMember[];
}

const ROLE_CONFIG: Record<
  GroupRole,
  { label: string; icon: React.ReactNode; className: string }
> = {
  LEADER: {
    label: "Líder",
    icon: <Crown size={14} className="text-amber-400" />,
    className: "text-amber-400 font-semibold",
  },
  CO_LEADER: {
    label: "Co-líder",
    icon: <Star size={14} className="text-sky-400" />,
    className: "text-sky-400 font-semibold",
  },
  MEMBER: {
    label: "Miembro",
    icon: null,
    className: "text-text-secondary",
  },
};

export default function GroupMemberList({ members }: GroupMemberListProps) {
  return (
    <div className="w-full">
      <p className="text-text-muted text-xs overline mb-3">
        MIEMBROS ({members.length})
      </p>
      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const roleConfig = ROLE_CONFIG[member.role];
          return (
            <li
              key={member.id}
              className="flex items-center gap-3 bg-surface-2 border border-border rounded-xl px-3 py-2.5"
            >
              <Avatar
                src={member.avatarUrl ?? undefined}
                alt={member.name}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-sm font-medium truncate">
                  {member.name}
                </p>
                <div className={`flex items-center gap-1 text-xs ${roleConfig.className}`}>
                  {roleConfig.icon}
                  <span>{roleConfig.label}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
