import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowRight, Store } from "lucide-react";
import { getContextOptions } from "@/API/ContextAPI";
import { Button } from "@/components/ui/Button";

/**
 * LB-117: cambio de modo (usuario / cajero / dueño) desde el perfil.
 * Solo se muestra si el usuario tiene roles de bar.
 */
export default function ProfileModeSection() {
  const navigate = useNavigate();

  const { data: options, isLoading } = useQuery({
    queryKey: ["context-options"],
    queryFn: getContextOptions,
    retry: false,
  });

  const hasBarRoles =
    !!options && (options.cashier.length > 0 || options.owner.length > 0);

  if (isLoading || !hasBarRoles) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-display font-bold tracking-tight mb-2">
        Cambio de modo
      </h2>
      <p className="text-text-secondary text-sm mb-4">
        Entrá como cajero o dueño de tus bares. Al loguearte siempre arrancás
        como usuario.
      </p>
      <Button
        type="button"
        variant="outline"
        size="md"
        fullWidth
        onClick={() => navigate("/select-context", { state: { from: "/profile" } })}
      >
        <Store size={18} className="text-lime" />
        Cambiar a modo cajero / dueño
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
