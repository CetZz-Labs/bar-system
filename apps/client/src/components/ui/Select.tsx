import React, { forwardRef, useId } from "react";
import { cn } from "@/utils/cn";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  /** Clases para el wrapper externo (el `<select>` ocupa el 100%). */
  wrapperClassName?: string;
}

/**
 * `<select>` nativo tematizado. Reemplaza la cadena de clases duplicada
 * literalmente en `BarDashboardView` / `BarAuditLogView` / `BarReportsView`.
 * Asocia `<label htmlFor>` automaticamente (`docs/design.md` §5).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, wrapperClassName, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className={cn("flex w-full flex-col gap-2", wrapperClassName)}>
        {label && (
          <label htmlFor={selectId} className="overline">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border transition-colors duration-normal ease-default",
            "focus:border-lime-border focus:ring-4 focus:ring-lime-glow",
            error ? "border-error" : "border-border",
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {children}
        </select>
        {error && <span className="font-ui text-sm text-error">{error}</span>}
      </div>
    );
  },
);
Select.displayName = "Select";
