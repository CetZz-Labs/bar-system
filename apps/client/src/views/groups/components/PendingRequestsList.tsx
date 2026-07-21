import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Check, X, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "sonner";
import { toastApiError } from "@/utils/apiError";
import { getGroupRequests, approveGroupRequest, rejectGroupRequest } from "@/API/GroupAPI";
import type { GroupJoinRequest } from "@/types/group";

interface PendingRequestsListProps {
  slug: string;
  onRefetch?: () => void;
}

export default function PendingRequestsList({ slug, onRefetch }: PendingRequestsListProps) {
  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getGroupRequests(slug)
      .then((data) => {
        if (!cancelled) {
          setRequests(data ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toastApiError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleApprove = async (requestId: string) => {
    setProcessingIds((prev) => new Set(prev).add(requestId));
    try {
      await approveGroupRequest(slug, requestId);
      toast.success("Solicitud aprobada");
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      onRefetch?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingIds((prev) => new Set(prev).add(requestId));
    try {
      await rejectGroupRequest(slug, requestId);
      toast.success("Solicitud rechazada");
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      onRefetch?.();
    } catch (err) {
      toastApiError(err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={18} className="text-amber-400" />
          <h3 className="text-base font-semibold text-text-primary">
            Solicitudes pendientes
          </h3>
        </div>
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="w-full h-14 bg-surface-2 border border-border rounded-xl" />
          <div className="w-full h-14 bg-surface-2 border border-border rounded-xl" />
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={18} className="text-amber-400" />
        <h3 className="text-base font-semibold text-text-primary">
          Solicitudes pendientes
        </h3>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 text-xs font-medium">
          {requests.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {requests.map((req) => {
          const isProcessing = processingIds.has(req.id);
          return (
            <motion.div
              key={req.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl border border-border"
            >
              <Avatar
                src={req.user.avatarUrl ?? undefined}
                alt={req.user.name}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {req.user.name}
                </p>
                <p className="text-xs text-text-secondary">
                  {new Date(req.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="surface"
                  size="sm"
                  className="w-8 h-8 p-0"
                  aria-label="Rechazar solicitud"
                  disabled={isProcessing}
                  onClick={() => handleReject(req.id)}
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <X size={16} />
                  )}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-8 h-8 p-0"
                  aria-label="Aprobar solicitud"
                  disabled={isProcessing}
                  onClick={() => handleApprove(req.id)}
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
