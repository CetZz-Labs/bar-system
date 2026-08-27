import React from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Aplica hover de borde + cursor. Usar en cards clickeables. */
  interactive?: boolean;
  /** Densidad del padding interno. `md` = 16px (default), `lg` = 20px, `none` = 0. */
  padding?: "none" | "md" | "lg";
}

/**
 * Contenedor base del design system. Superficie `surface`, borde `border` y
 * radius unificado (`rounded-xl`, 20px) para TODAS las cards, sin importar el
 * dominio. Reemplaza los patrones inline `p-4 rounded-lg bg-surface-2 ...` y
 * `rounded-xl border bg-surface-2 ...` dispersos en las vistas, y la clase CSS
 * `.card` (deprecada).
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, padding = "md", className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-surface-2 border border-border rounded-xl",
          padding === "md" && "p-4",
          padding === "lg" && "p-5",
          interactive &&
            "transition-colors duration-normal ease-default hover:border-border-hover",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = "Card";
