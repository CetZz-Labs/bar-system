import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export interface SpinnerProps {
  /** Tamaño del icono: `sm` = 16, `md` = 24 (default), `lg` = 32. */
  size?: "sm" | "md" | "lg";
  /** Centra el spinner en un contenedor flex que ocupa el alto disponible. */
  center?: boolean;
  /** Texto accesible; se expone como `aria-label` (default "Cargando"). */
  label?: string;
  className?: string;
}

const SIZE_PX: Record<NonNullable<SpinnerProps["size"]>, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

/**
 * Indicador de carga unico del design system. Reemplaza los 3 patrones
 * previos: `<Loader2 className="animate-spin" />` suelto, el spinner CSS
 * hand-rolled de `MyBarsView` y el `<div>Loading...</div>` de `MainLayout`.
 */
export function Spinner({ size = "md", center = false, label = "Cargando", className }: SpinnerProps) {
  const icon = (
    <Loader2
      role="status"
      aria-label={label}
      size={SIZE_PX[size]}
      className={cn("animate-spin text-lime", className)}
    />
  );

  if (center) {
    return (
      <div className="flex flex-1 items-center justify-center py-10">{icon}</div>
    );
  }

  return icon;
}
