import { useState } from "react";
import { Crown, Star, ArrowUpCircle, ArrowDownCircle, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import { updateMemberRole, removeMember } from "@/API/GroupAPI";
import type { GroupMember, GroupRole } from "@/types/group";

interface GroupMemberListProps {
  members: GroupMember[];
  canManage: boolean;
  currentUserId: string;
  slug: string;
  onAction?: () => void;
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

type ModalState = {
  isOpen: boolean;
  member: GroupMember | null;
  action: "promote" | "demote" | "remove" | null;
};

export default function GroupMemberList({
  members,
  canManage,
  currentUserId,
  slug,
  onAction,
}: GroupMemberListProps) {
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    member: null,
    action: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = (member: GroupMember, action: ModalState["action"]) => {
    setModalState({ isOpen: true, member, action });
  };

  const confirmAction = async () => {
    if (!modalState.member || !modalState.action) return;

    setIsProcessing(true);
    try {
      if (modalState.action === "promote") {
        await updateMemberRole(slug, modalState.member.id, "CO_LEADER");
        toast.success(`${modalState.member.name} fue promovido a co-líder`);
      } else if (modalState.action === "demote") {
        await updateMemberRole(slug, modalState.member.id, "MEMBER");
        toast.success(`${modalState.member.name} fue degradado a miembro`);
      } else if (modalState.action === "remove") {
        await removeMember(slug, modalState.member.id);
        toast.success(`${modalState.member.name} fue expulsado del grupo`);
      }
      onAction?.();
    } catch {
      toast.error("Ocurrió un error. Intentá de nuevo.");
    } finally {
      setIsProcessing(false);
      setModalState({ isOpen: false, member: null, action: null });
    }
  };

  const getModalConfig = () => {
    if (!modalState.member || !modalState.action) return { title: "", description: "" };

    const name = modalState.member.name;

    switch (modalState.action) {
      case "promote":
        return {
          title: "Promover a co-líder",
          description: `¿Querés promover a ${name} como co-líder? Podrá gestionar solicitudes de unión.`,
        };
      case "demote":
        return {
          title: "Degradar a miembro",
          description: `¿Querés degradar a ${name} como miembro? Perderá los permisos de co-líder.`,
        };
      case "remove":
        return {
          title: "Expulsar del grupo",
          description: `¿Querés expulsar a ${name} del grupo? Esta acción no se puede deshacer.`,
        };
      default:
        return { title: "", description: "" };
    }
  };

  return (
    <div className="w-full">
      <p className="text-text-muted text-xs overline mb-3">
        MIEMBROS ({members.length})
      </p>
      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const roleConfig = ROLE_CONFIG[member.role];
          const isCurrentUser = member.id === currentUserId;
          const showActions = canManage && !isCurrentUser && member.role !== "LEADER";

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
              {showActions && (
                <div className="flex items-center gap-1">
                  {member.role === "MEMBER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAction(member, "promote")}
                      aria-label="Promover"
                    >
                      <ArrowUpCircle size={16} />
                    </Button>
                  )}
                  {member.role === "CO_LEADER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAction(member, "demote")}
                      aria-label="Degradar"
                    >
                      <ArrowDownCircle size={16} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(member, "remove")}
                    aria-label="Expulsar"
                  >
                    <UserMinus size={16} className="text-error" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, member: null, action: null })}
        onConfirm={confirmAction}
        title={getModalConfig().title}
        description={getModalConfig().description}
        confirmText={modalState.action === "remove" ? "Expulsar" : "Confirmar"}
        cancelText="Cancelar"
        isPending={isProcessing}
      />
    </div>
  );
}
