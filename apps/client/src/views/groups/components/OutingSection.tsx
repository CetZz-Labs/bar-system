import { useEffect, useRef, useState } from "react";
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
  /** LB-76: bar pre-seleccionado al llegar desde la ficha de un bar
   * (`state` de navegación leído por GroupDetailView). Si está presente y
   * el usuario puede gestionar salidas, abre automáticamente el modal de
   * creación con ese bar precargado. */
  preselectedBarId?: string;
}

export default function OutingSection({
  groupId,
  members,
  currentUserRole,
  preselectedBarId,
}: OutingSectionProps) {
  const canManageOuting = currentUserRole === "LEADER" || currentUserRole === "CO_LEADER";
  // LB-76 fixup: el auto-open ya no puede decidirse síncronamente en el
  // inicializador. Antes arrancaba en `true` con solo mirar
  // `preselectedBarId`/`canManageOuting` (disponibles al montar), pero eso
  // ignoraba el `status` real de `activeOuting` (llega async vía useQuery) y
  // abría el modal de edición incluso para una salida `ACTIVE` (en curso,
  // check-in confirmado), que no tiene sentido editar — ver `canEditOuting`
  // más abajo. Arranca en `false`; el bloque de `autoOpenDecided` más abajo
  // decide una vez que `activeOuting` resuelve.
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: activeOuting, isLoading } = useQuery({
    queryKey: ["outings", "active", groupId],
    queryFn: () => getActiveOuting(groupId),
    enabled: !!groupId,
    refetchOnWindowFocus: false,
  });

  // LB-76 fixup: `activeOuting` llega async (useQuery), a diferencia de
  // `preselectedBarId`/`canManageOuting` que ya están disponibles al montar.
  // Por eso el auto-open no puede calcularse en el inicializador de
  // `modalOpen` de arriba: hay que esperar a que la query resuelva para
  // saber si corresponde crear (sin `activeOuting`), editar (`PENDING`, el
  // único estado que `canEditOuting` habilita) o no abrir nada (`ACTIVE` u
  // otro estado no editable — no tiene sentido "editar" una salida ya en
  // curso).
  //
  // Este ajuste de estado se hace durante el render (no dentro de un
  // useEffect) siguiendo el mismo criterio que `syncedBarId` en
  // BarProfileView.tsx: es estado derivado de datos que llegaron de un
  // fetch, no una sincronización con un sistema externo, y llamar a
  // `setState` directamente en el cuerpo de un efecto dispara la regla
  // react-hooks/set-state-in-effect (cascading renders). `autoOpenDecided`
  // garantiza que la decisión se tome una única vez por montaje, no en cada
  // refetch posterior (cancelar/crear invalida
  // `["outings", "active", groupId]`).
  const [autoOpenDecided, setAutoOpenDecided] = useState(false);
  if (!isLoading && !autoOpenDecided && preselectedBarId && canManageOuting) {
    setAutoOpenDecided(true);
    if (!activeOuting || activeOuting.status === "PENDING") {
      setModalOpen(true);
    }
  }

  // El aviso por toast sí es un efecto legítimo (notifica a través de un
  // sistema externo, sonner), por eso se queda en un useEffect separado del
  // ajuste de estado de arriba. El ref replica la misma garantía de "una
  // sola vez por montaje" que `autoOpenDecided`, pero de forma independiente
  // para no acoplar el side effect a la decisión de abrir el modal.
  const warnedPreselectedConflictRef = useRef(false);
  useEffect(() => {
    if (isLoading || warnedPreselectedConflictRef.current) return;
    warnedPreselectedConflictRef.current = true;

    if (!preselectedBarId || !canManageOuting || !activeOuting) return;

    if (activeOuting.status === "PENDING") {
      if (activeOuting.bar._id !== preselectedBarId) {
        toast.info(
          `Ya tenés una salida en curso en este grupo — te abrimos para editarla en vez de crear una nueva. La salida existente es en ${activeOuting.bar.name}, no en el que elegiste.`
        );
      } else {
        toast.info(
          "Ya tenés una salida en curso en este grupo — te abrimos para editarla en vez de crear una nueva."
        );
      }
      return;
    }

    // Estado no editable (ACTIVE u otro distinto de PENDING): el modal se
    // queda cerrado, el toast solo informa que no hay nada para abrir.
    if (activeOuting.bar._id !== preselectedBarId) {
      toast.info(
        `Ya tenés una salida en curso en este grupo — no se puede crear ni editar otra hasta que termine. La salida en curso es en ${activeOuting.bar.name}, no en el que elegiste.`
      );
    } else {
      toast.info(
        "Ya tenés una salida en curso en este grupo — no se puede crear ni editar otra hasta que termine."
      );
    }
  }, [isLoading, activeOuting, preselectedBarId, canManageOuting]);

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
          preselectedBarId={preselectedBarId}
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
