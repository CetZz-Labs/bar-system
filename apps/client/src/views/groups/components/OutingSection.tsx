import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MapPin, PenLine, PlusCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cancelOuting, getActiveOuting } from "@/API/OutingAPI";
import { toastApiError } from "@/utils/apiError";
import type { GroupMember, GroupRole } from "@/types/group";
import OutingFormModal from "./OutingFormModal";

interface OutingSectionProps {
  groupId: string;
  members: GroupMember[];
  currentUserRole: GroupRole;
}

export default function OutingSection({
  groupId,
  members,
  currentUserRole,
}: OutingSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const canManageOuting = currentUserRole === "LEADER" || currentUserRole === "CO_LEADER";
  const queryClient = useQueryClient();

  const { data: activeOuting, isLoading } = useQuery({
    queryKey: ["outings", "active", groupId],
    queryFn: () => getActiveOuting(groupId),
    enabled: !!groupId,
    refetchOnWindowFocus: false,
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!activeOuting) throw new Error("No hay una salida activa para cancelar");
      return cancelOuting(groupId, activeOuting._id);
    },
    onSuccess: () => {
      toast.success("Salida cancelada");
      queryClient.invalidateQueries({ queryKey: ["outings", "active", groupId] });
      setCancelModalOpen(false);
    },
    onError: (error: unknown) => {
      toastApiError(error);
      setCancelModalOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="w-full h-24 bg-surface-2 border border-border rounded-xl animate-pulse" />
    );
  }

  // Members without manage rights and no active outing: nothing to show.
  if (!activeOuting && !canManageOuting) {
    return null;
  }

  const formattedDate = activeOuting
    ? new Date(activeOuting.scheduledFor).toLocaleString("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const canEditOuting = canManageOuting && activeOuting?.status === "PENDING";

  return (
    <div className="w-full">
      <p className="text-text-muted text-xs overline mb-3">SALIDA</p>

      {activeOuting ? (
        <div className="w-full bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-text-primary font-display font-bold text-lg truncate">
                {activeOuting.bar.name}
              </p>
              <div className="flex items-center gap-1.5 text-text-secondary text-sm mt-1">
                <CalendarClock size={14} />
                <span>{formattedDate}</span>
              </div>
              {activeOuting.bar.address && (
                <div className="flex items-center gap-1.5 text-text-secondary text-sm mt-1">
                  <MapPin size={14} />
                  <span>
                    {activeOuting.bar.address.street} {activeOuting.bar.address.number}
                  </span>
                </div>
              )}
            </div>
            <span className="px-2.5 py-1 rounded-full bg-lime-dim text-lime text-xs font-ui font-medium whitespace-nowrap">
              {activeOuting.status === "PENDING" ? "Planificada" : "En curso"}
            </span>
          </div>

          {activeOuting.note && (
            <p className="text-text-secondary text-sm">{activeOuting.note}</p>
          )}

          <p className="text-text-muted text-xs">
            {activeOuting.invitees.length}{" "}
            {activeOuting.invitees.length === 1 ? "invitado" : "invitados"}
          </p>

          {canEditOuting && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
                <PenLine size={16} className="mr-2" />
                Editar salida
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCancelModalOpen(true)}>
                <XCircle size={16} className="mr-2" />
                Cancelar salida
              </Button>
            </div>
          )}
        </div>
      ) : (
        canManageOuting && (
          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setModalOpen(true)}
          >
            <PlusCircle size={18} className="mr-2" />
            Crear salida
          </Button>
        )
      )}

      {canManageOuting && (
        <OutingFormModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          groupId={groupId}
          members={members}
          outing={activeOuting ?? null}
        />
      )}

      {canEditOuting && (
        <Modal
          isOpen={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          onConfirm={() => cancelMutation.mutate()}
          title="Cancelar salida"
          description="¿Querés cancelar esta salida? Los invitados van a ser notificados y esta acción no se puede deshacer."
          confirmText="Sí, cancelar"
          cancelText="Volver"
          isPending={cancelMutation.isPending}
        />
      )}
    </div>
  );
}
