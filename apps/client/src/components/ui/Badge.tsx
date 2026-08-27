import React from "react";
import { cn } from "@/utils/cn";

export type BadgeVariant = "success" | "warning" | "error" | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Icono lucide opcional a la izquierda del texto. */
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-lime-dim text-lime border-lime-border",
  warning: "bg-warning-dim text-warning border-warning-border",
  error: "bg-error-dim text-error border-error-border",
  neutral: "bg-surface-3 text-text-secondary border-border",
};

/**
 * Chip de estado del design system. Unifica los mapas de color duplicados en
 * `BarDashboardView` (`STATUS_BADGE_CLASSES`), `MyBarsView` (`config`) y
 * `BarCategoriesView`. Para mapear un string de estado del backend a una
 * variante, usar `statusBadgeVariant()`.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", icon, className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium",
          VARIANT_CLASSES[variant],
          className,
        )}
        {...props}
      >
        {icon}
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";
