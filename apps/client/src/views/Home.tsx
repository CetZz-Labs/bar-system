import { Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Users, Plus, Search, Loader2 } from "lucide-react";
import { getUserGroups } from "@/API/UserAPI";

export default function Home() {
  const groupsQuery = useQuery({
    queryKey: ["myGroups"],
    queryFn: getUserGroups,
  });

  if (groupsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] pb-nav">
        <Loader2 className="animate-spin text-lime" size={28} />
      </div>
    );
  }

  const groups = groupsQuery.data ?? [];
  if (groups.length > 0 && groups[0].slug) {
    return <Navigate to={`/groups/${groups[0].slug}/home`} replace />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-4 pb-nav">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-lime-dim">
          <Users size={32} className="text-lime" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold tracking-tight mb-2">
            Bienvenido a La Banda
          </h1>
          <p className="text-text-secondary text-base">
            Organizá tu grupo, acumulá puntos y competí junto a tus amigos.
          </p>
        </div>
        <Link to="/groups/create" className="w-full">
          <Button variant="primary" size="lg" fullWidth>
            <Plus size={20} />
            Crear grupo
          </Button>
        </Link>
        <Link to="/bar/explorar" className="w-full">
          <Button variant="surface" size="lg" fullWidth>
            <Search size={20} />
            Explorar bares
          </Button>
        </Link>
      </div>
    </div>
  );
}
