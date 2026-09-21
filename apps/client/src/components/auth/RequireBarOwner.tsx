import { Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/Spinner";
import { getMyBars } from "@/API/BarAPI";
import { useActiveContext } from "@/hooks/useActiveContext";

/**
 * LB-85: bloquea rutas de admin del bar (perfil editable, dashboard, etc.)
 * a quien no sea OWNER en getMyBars. También redirige si el JWT activo es
 * contexto cajero/dueño (modo bar).
 */
export function RequireBarOwner({ children }: { children: React.ReactNode }) {
  const { id, barId: barIdParam } = useParams<{ id?: string; barId?: string }>();
  const barId = id ?? barIdParam;
  const { isLoading: contextLoading, isBarContext, roleHome } = useActiveContext();

  const { data: myBars, isLoading: barsLoading } = useQuery({
    queryKey: ["myBars"],
    queryFn: getMyBars,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: !contextLoading && !isBarContext,
  });

  if (contextLoading || barsLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isBarContext) {
    return <Navigate to={roleHome} replace />;
  }

  const isOwner = myBars?.some((bar) => bar.id === barId && bar.role === "OWNER");
  if (!isOwner) {
    return <Navigate to="/bar/mis-bares" replace />;
  }

  return <>{children}</>;
}
