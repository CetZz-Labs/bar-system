import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { getGroupBySlug } from "@/API/GroupAPI";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { FIRST_VISIT_KEYS } from "@/utils/firstVisit";
import { GroupRewardsSection } from "./components/GroupRewardsSection";

/**
 * LB-72: recompensas disponibles del grupo en el bar del check-in activo.
 * LB-68: canje end-to-end (QR + código manual, cancelación, listado).
 *
 * LB-111: la lógica de recompensas/canje en sí vive ahora en
 * `components/GroupRewardsSection.tsx` (reutilizada también por
 * `GroupOutingView.tsx`) — esta vista solo resuelve el grupo/rol y monta el
 * header + la sección.
 */

export default function GroupRewardsView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const backToGroup = () => navigate(slug ? `/groups/${slug}` : "/groups");

  const {
    data: group,
    isLoading: isLoadingGroup,
    isError: isGroupError,
    refetch: refetchGroup,
  } = useQuery({
    queryKey: ["group", slug],
    queryFn: () => getGroupBySlug(slug!),
    enabled: !!slug,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const groupId = group?.id;
  const canManageRedemptions =
    group?.currentUserRole === "LEADER" || group?.currentUserRole === "CO_LEADER";

  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col flex-1 pb-nav pt-5 px-4 min-h-[100dvh] max-w-sm mx-auto w-full"
    >
      <header className="flex items-center gap-4 mb-6 relative">
        <IconButton
          aria-label="Volver"
          onClick={() => navigate(slug ? `/groups/${slug}` : "/groups")}
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </IconButton>
        <h1 className="text-2xl font-display font-bold tracking-tight m-0">Recompensas</h1>
        <CoachMark
          storageKey={FIRST_VISIT_KEYS.coachRewards}
          title="Canjeá puntos"
          body="Con check-in activo podés canjear recompensas del bar. El saldo se actualiza en vivo."
          placement="bottom"
          className="left-12"
        />
      </header>

      {isGroupError && (
        <ErrorState
          title="No pudimos cargar el grupo."
          description="Revisá tu conexión e intentá de nuevo."
          onRetry={() => refetchGroup()}
          onBack={backToGroup}
        />
      )}

      {!isGroupError && isLoadingGroup && (
        <Spinner center size="lg" label="Cargando recompensas" />
      )}

      {!isGroupError && !isLoadingGroup && (
        <GroupRewardsSection
          groupId={groupId}
          canManageRedemptions={canManageRedemptions}
          onBack={backToGroup}
        />
      )}
    </motion.div>
  );
}
