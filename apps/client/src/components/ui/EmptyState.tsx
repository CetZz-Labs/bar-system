import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export interface EmptyStateProps {
  /** Icono lucide (el componente, no un elemento). */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Slot para un CTA (`<Button>`), opcional. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vacio unificado: icono en circulo lima + titulo + subtitulo + CTA
 * opcional. Reemplaza los bloques "empty" re-implementados en cada vista.
 * El copy sigue el catalogo de `docs/design.md` (formula "Todavia no ...").
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lime-dim">
        <Icon size={28} className="text-lime" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold text-text-primary">{title}</p>
        {description && (
          <p className="max-w-xs text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
