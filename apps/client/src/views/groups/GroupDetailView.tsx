import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, Users, Settings, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "sonner";
import { getGroupBySlug } from "@/API/GroupAPI";
import type { GroupDetail } from "@/types/group";
import GroupMemberList from "./components/GroupMemberList";
import GroupInviteSection from "./components/GroupInviteSection";
import PendingRequestsList from "./components/PendingRequestsList";

type ErrorType = "not_found" | "forbidden" | "server" | null;

export default function GroupDetailView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorType>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!slug) {
      setError("not_found");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getGroupBySlug(slug)
      .then((data) => {
        if (!cancelled) {
          if (data) {
            setGroup(data);
          } else {
            setError("not_found");
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);

        if (
          err &&
          typeof err === "object" &&
          "type" in err &&
          err.type === "server" &&
          "status" in err
        ) {
          if (err.status === 404) setError("not_found");
          else if (err.status === 403) setError("forbidden");
          else setError("server");
        } else {
          setError("server");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, refreshKey]);

  useEffect(() => {
    if (group && group.canManage && (group.pendingRequestsCount ?? 0) > 0) {
      toast.info(
        `Tenés ${group.pendingRequestsCount} solicitud${group.pendingRequestsCount === 1 ? "" : "es"} de unión pendiente`,
        {
          id: `pending-requests-${slug}`,
          duration: 5000,
        }
      );
    }
  }, [group, slug]);

  const handleSettings = () => {
    toast.info("Configuración del grupo disponible próximamente");
  };

  const renderError = () => {
    const configs: Record<
      NonNullable<ErrorType>,
      { title: string; message: string }
    > = {
      not_found: {
        title: "Grupo no encontrado",
        message:
          "El grupo que buscás no existe o fue eliminado.",
      },
      forbidden: {
        title: "Acceso denegado",
        message: "No sos miembro de este grupo. Pedí una invitación para unirte.",
      },
      server: {
        title: "Error del servidor",
        message: "Ocurrió un error inesperado. Intentá de nuevo más tarde.",
      },
    };

    const config = configs[error!];

    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 text-center">
        <AlertCircle size={48} className="text-text-muted" />
        <div>
          <p className="text-text-primary text-lg font-semibold">
            {config.title}
          </p>
          <p className="text-text-secondary text-sm mt-1">{config.message}</p>
        </div>
        <Button variant="outline" size="md" onClick={() => navigate("/")}>
          Volver al inicio
        </Button>
      </div>
    );
  };

  const renderSkeleton = () => (
    <div className="flex flex-col items-center gap-6 animate-pulse">
      <div className="w-24 h-24 rounded-full bg-surface-2 border border-border" />
      <div className="flex flex-col items-center gap-2">
        <div className="w-40 h-6 bg-surface-2 rounded-md" />
        <div className="w-56 h-4 bg-surface-2 rounded-md" />
      </div>
      <div className="w-24 h-6 bg-surface-2 rounded-full" />
      <div className="w-full max-w-sm h-24 bg-surface-2 border border-border rounded-xl" />
      <div className="w-full max-w-sm h-48 bg-surface-2 border border-border rounded-xl" />
    </div>
  );

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh]"
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">
          Grupo
        </h1>
      </header>

      {loading && renderSkeleton()}

      {!loading && error && renderError()}

      {!loading && !error && group && (
        <div className="flex flex-col items-center gap-6 max-w-sm mx-auto w-full">
          {/* Avatar */}
          <Avatar
            src={group.avatarUrl}
            alt={group.name}
            size="lg"
            className="border-2 border-lime-border"
          />

          {/* Name & Description */}
          <div className="text-center">
            <h2 className="text-xl font-display font-bold text-text-primary">
              {group.name}
            </h2>
            {group.description && (
              <p className="text-text-secondary text-sm mt-1">
                {group.description}
              </p>
            )}
          </div>

          {/* Type & Member Count */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-lime" />
              <span
                className={`px-3 py-1 rounded-full text-sm font-ui font-medium ${
                  group.type === "OPEN"
                    ? "bg-lime-dim text-lime"
                    : "bg-surface-2 text-text-secondary"
                }`}
              >
                {group.type === "OPEN" ? "Abierto" : "Cerrado"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-text-secondary text-sm">
              <Users size={14} />
              <span>
                {group.memberCount}{" "}
                {group.memberCount === 1 ? "miembro" : "miembros"}
              </span>
            </div>
          </div>

          {/* Members List */}
          <GroupMemberList members={group.members} />

          {/* Pending Requests — visible only for LEADER */}
          {group.canManage && (
            <PendingRequestsList
              slug={group.slug}
              onRefetch={refetch}
            />
          )}

          {/* Invite Section — visible only for LEADER and CO_LEADER */}
          {group.inviteCode && group.inviteLink && (
            <GroupInviteSection
              inviteCode={group.inviteCode}
              inviteLink={group.inviteLink}
              groupName={group.name}
              slug={group.slug}
            />
          )}

          {/* Settings — visible only for LEADER */}
          {group.canManage && (
            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={handleSettings}
            >
              <Settings size={18} className="mr-2" />
              Configuración del grupo
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
