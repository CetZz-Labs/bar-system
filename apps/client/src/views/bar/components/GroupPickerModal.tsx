import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Users, X, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getUserGroups } from "@/API/UserAPI";

/**
 * LB-76: selector de grupo intermedio para "Crear salida en este bar".
 * Decisión de producto confirmada con el usuario: en vez de asumir un grupo
 * (el cliente puede pertenecer a varios), se lista sus grupos y, al elegir
 * uno, se navega a `/groups/:slug` pasando el bar a pre-seleccionar vía
 * `state` de navegación (no query string) — leído por GroupDetailView y
 * reenviado a OutingFormModal a través de OutingSection.
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
  const { data: groups, isLoading } = useQuery({
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay backdrop-blur-sm px-0 sm:px-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-picker-modal-title"
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-xl sm:rounded-xl border border-border p-6 shadow-modal"
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              id="group-picker-modal-title"
              className="text-xl font-display font-bold tracking-tight text-text-primary"
            >
              Elegí un grupo
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex justify-center items-center w-8 h-8 rounded-full bg-surface-2 border border-border hover:bg-surface-3 transition-colors"
            >
              <X size={16} className="text-text-secondary" />
            </button>
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 size={28} className="text-lime animate-spin" />
              <p className="text-text-secondary text-sm">Cargando tus grupos...</p>
            </div>
          )}

          {!isLoading && groups && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <Users size={40} className="text-text-muted" />
              <p className="text-text-secondary text-sm">
                Todavía no pertenecés a ningún grupo. Creá uno para poder armar una salida.
              </p>
            </div>
          )}

          {!isLoading && groups && groups.length > 0 && (
            <div className="flex flex-col gap-2">
              {groups.map((group) => (
                <button
                  key={group.groupId}
                  type="button"
                  onClick={() => handlePick(group.slug)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-border transition-colors hover:border-border-hover hover:bg-surface-3 text-left w-full"
                >
                  <Avatar src={group.avatarUrl} alt={group.name} size="sm" />
                  <span className="flex-1 min-w-0 font-ui font-semibold text-text-primary truncate">
                    {group.name}
                  </span>
                  <ChevronRight size={18} className="text-text-muted shrink-0" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
