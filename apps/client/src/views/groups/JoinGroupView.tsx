import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, Users, AlertCircle, Loader2, LogIn, CheckCircle2, Ban, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "sonner";
import { getGroupByInviteCode, joinGroup } from "@/API/GroupAPI";
import { useAuth } from "@/hooks/useAuth";
import type { GroupInviteInfo, GroupUserStatus } from "@/types/group";

type ErrorType = "not_found" | "server" | null;

export default function JoinGroupView() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { data: authData } = useAuth();

  const [group, setGroup] = useState<GroupInviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorType>(null);
  const [joining, setJoining] = useState(false);
  const [joinedMessage, setJoinedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      setError("not_found");
      setLoading(false);
      return;
    }

    let cancelled = false;

    getGroupByInviteCode(inviteCode)
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
          else setError("server");
        } else {
          setError("server");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const handleJoin = async () => {
    if (!inviteCode || !group) return;

    if (!authData) {
      navigate("/login", { state: { from: `/unirse/${inviteCode}` } });
      return;
    }

    setJoining(true);
    try {
      const result = await joinGroup(inviteCode);
      if (!result) return;

      if ("group" in result && result.group) {
        toast.success(result.message || "Te uniste al grupo exitosamente");
        navigate(`/groups/${result.group.slug}`);
        return;
      }

      if ("status" in result && result.status === "pending") {
        setJoinedMessage(result.message || "Solicitud enviada, esperando aprobación");
        setGroup((prev) => (prev ? { ...prev, userStatus: "pending" } : prev));
        return;
      }
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "type" in err &&
        err.type === "server" &&
        "status" in err
      ) {
        if (err.status === 409) {
          const message =
            (err as { message?: string }).message || "Ya sos parte de este grupo";
          toast.info(message);
          setGroup((prev) => (prev ? { ...prev, userStatus: "member" } : prev));
          return;
        }
        if (err.status === 403) {
          const message =
            (err as { message?: string }).message || "No podés unirte a este grupo";
          toast.error(message);
          setGroup((prev) => (prev ? { ...prev, userStatus: "banned" } : prev));
          return;
        }
        if (err.status === 404) {
          toast.error("El grupo no existe o fue eliminado");
          setError("not_found");
          return;
        }
      }
      toast.error("Ocurrió un error al intentar unirte al grupo");
    } finally {
      setJoining(false);
    }
  };

  const getUserStatusConfig = (status: GroupUserStatus | undefined) => {
    switch (status) {
      case "member":
        return {
          label: "Ya sos parte de este grupo",
          disabled: true,
          icon: <CheckCircle2 size={20} />,
          variant: "surface" as const,
          action: () => {
            if (group) navigate(`/groups/${group.slug}`);
          },
        };
      case "banned":
        return {
          label: "No podés unirte a este grupo",
          disabled: true,
          icon: <Ban size={20} />,
          variant: "surface" as const,
          action: undefined,
        };
      case "pending":
        return {
          label: "Solicitud enviada, esperando aprobación",
          disabled: true,
          icon: <Clock size={20} />,
          variant: "surface" as const,
          action: undefined,
        };
      case "available":
      default:
        return {
          label: "Unirme al grupo",
          disabled: false,
          icon: null,
          variant: "primary" as const,
          action: handleJoin,
        };
    }
  };

  const renderError = () => {
    const configs: Record<
      NonNullable<ErrorType>,
      { title: string; message: string }
    > = {
      not_found: {
        title: "Grupo no encontrado",
        message:
          "El código de invitación no es válido o el grupo fue eliminado.",
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
      <div className="w-full max-w-sm h-12 bg-surface-2 border border-border rounded-xl" />
    </div>
  );

  const isAuthenticated = !!authData;
  const statusConfig = getUserStatusConfig(group?.userStatus);

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-8 pt-5 px-4 min-h-[100dvh]"
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
          Unirse a grupo
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

          {/* Join Button */}
          <div className="w-full mt-4">
            {!isAuthenticated ? (
              <div className="flex flex-col gap-3">
                <p className="text-text-secondary text-sm text-center">
                  Iniciá sesión para unirte a este grupo
                </p>
                <Link to="/login" state={{ from: `/unirse/${inviteCode}` }} className="w-full">
                  <Button variant="primary" size="lg" fullWidth>
                    <LogIn size={20} className="mr-2" />
                    Iniciar sesión
                  </Button>
                </Link>
              </div>
            ) : (
              <Button
                variant={statusConfig.variant}
                size="lg"
                fullWidth
                onClick={statusConfig.action}
                disabled={statusConfig.disabled || joining}
              >
                {joining ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Uniéndote...
                  </>
                ) : (
                  <>
                    {statusConfig.icon}
                    {statusConfig.icon && <span className="mr-2" />}
                    {joinedMessage || statusConfig.label}
                  </>
                )}
              </Button>
            )}
          </div>

          {joinedMessage && (
            <p className="text-text-secondary text-sm text-center">
              {joinedMessage}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
