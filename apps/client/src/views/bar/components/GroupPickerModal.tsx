import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Users, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/utils/cn";
import { getUserGroups } from "@/API/UserAPI";

/**
 * LB-76: selector de grupo intermedio para "Crear salida en este bar".
 * Decisión de producto confirmada con el usuario: en vez de asumir un grupo
 * (el cliente puede pertenecer a varios), se lista sus grupos y, al elegir
 * uno, se navega a `/groups/:slug` pasando el bar a pre-seleccionar vía
 * `state` de navegación (no query string) — leído por GroupDetailView y
 * reenviado a OutingFormModal a través de OutingSection.
 *
 * LB-90: migrado al primitivo `<Modal>` (modo `hideFooter` + `showCloseButton`
 * con cierre por Escape). El comportamiento bottom-sheet en mobile se
 * reemplaza por el modal centrado del design system.
 */

interface GroupPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  barId: string;
}

export default function GroupPickerModal({ isOpen, onClose, barId }: GroupPickerModalProps) {
  const navigate = useNavigate();

  // Misma queryKey que GroupsListView.tsx: comparten cache, sin inventar un
  // mecanismo de fetching nuevo para "los grupos del usuario".
  const {
    data: groups,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["userGroups"],
    queryFn: getUserGroups,
    enabled: isOpen,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const handlePick = (slug: string) => {
    onClose();
    navigate(`/groups/${slug}`, { state: { preselectedBarId: barId } });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Elegí un grupo" size="md" hideFooter showCloseButton>
      {isLoading && <Spinner center label="Cargando tus grupos" />}

      {!isLoading && isError && (
        <ErrorState
          title="No pudimos cargar tus grupos."
          description="Revisá tu conexión e intentá de nuevo."
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && groups && groups.length === 0 && (
        <EmptyState
          icon={Users}
          title="Todavía no pertenecés a ningún grupo."
          description="Creá uno para poder armar una salida."
        />
      )}

      {!isLoading && !isError && groups && groups.length > 0 && (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <button
              key={group.groupId}
              type="button"
              onClick={() => handlePick(group.slug)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border text-left w-full",
                "transition-colors hover:border-border-hover hover:bg-surface-3",
                "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-border",
              )}
            >
              <Avatar src={group.avatarUrl} alt={group.name} size="sm" />
              <span className="flex-1 min-w-0 font-ui font-semibold text-text-primary truncate">
                {group.name}
              </span>
              <ChevronRight size={18} className="text-text-secondary shrink-0" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
