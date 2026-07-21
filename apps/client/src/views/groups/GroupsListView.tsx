import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, Loader2, ChevronRight, ArrowRight, KeyRound } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { getUserGroups } from "@/API/UserAPI";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const ROLE_LABELS: Record<string, string> = {
  admin: "Líder",
  moderator: "Co-líder",
  member: "Miembro",
};

export default function GroupsListView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inviteCode, setInviteCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);

  const {
    data: groups,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["userGroups"],
    queryFn: getUserGroups,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (code.length === 6 && /^[A-Z0-9]+$/.test(code)) {
      navigate(`/unirse/${code}`);
    }
  };

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Mis grupos
        </h1>
        <Link to="/groups/create">
          <Button variant="surface" size="sm" aria-label="Crear grupo">
            <Plus size={18} />
          </Button>
        </Link>
      </header>

      {/* Join by code */}
      {!isLoading && (
        <div className="mb-6">
          {!showCodeInput ? (
            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => setShowCodeInput(true)}
            >
              <KeyRound size={18} className="mr-2" />
              Unirme con código
            </Button>
          ) : (
            <AnimatePresence>
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleJoinByCode}
                className="flex items-center gap-2"
              >
                <Input
                  placeholder="Código de invitación (6 caracteres)"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="flex-1"
                  aria-label="Código de invitación"
                  autoFocus
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={inviteCode.trim().length !== 6}
                  aria-label="Unirse por código"
                >
                  <ArrowRight size={18} />
                </Button>
              </motion.form>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Loader2 size={32} className="text-lime animate-spin" />
          <p className="text-text-secondary text-sm">Cargando tus grupos...</p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <Users size={48} className="text-text-muted" />
          <div>
            <p className="text-text-primary text-base font-medium">
              Error al cargar grupos
            </p>
            <p className="text-text-secondary text-sm mt-1">
              Ocurrió un error inesperado. Intentá de nuevo.
            </p>
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["userGroups"] })}
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && groups && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-lime-dim">
            <Users size={32} className="text-lime" />
          </div>
          <div>
            <p className="text-text-primary text-lg font-display font-bold">
              Todavía no pertenecés a ningún grupo
            </p>
            <p className="text-text-secondary text-sm mt-1">
              Creá uno o pedí una invitación para unirte.
            </p>
          </div>
          <Link to="/groups/create" className="w-full max-w-xs">
            <Button variant="primary" size="lg" fullWidth>
              <Plus size={20} />
              Crear grupo
            </Button>
          </Link>
        </div>
      )}

      {/* List */}
      {!isLoading && !isError && groups && groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <button
              key={group.groupId}
              onClick={() => navigate(`/groups/${group.slug}`)}
              className="flex items-center gap-4 p-4 bg-surface-2 rounded-xl border border-border transition-colors hover:border-border-hover hover:bg-surface-3 text-left w-full"
            >
              <Avatar
                src={group.avatarUrl}
                alt={group.name}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="font-ui font-semibold text-text-primary truncate">
                  {group.name}
                </p>
                <p className="text-text-secondary text-sm">
                  {ROLE_LABELS[group.role] ?? group.role}
                </p>
              </div>
              <ChevronRight size={20} className="text-text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
