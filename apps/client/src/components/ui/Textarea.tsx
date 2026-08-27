import React, { forwardRef, useId } from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  wrapperClassName?: string;
}

/**
 * `<textarea>` nativo tematizado. Reemplaza el textarea ad-hoc (misma cadena
 * de clases que los inputs + `resize-none`) de los modales de formulario.
 * Asocia `<label htmlFor>` automaticamente (`docs/design.md` §5).
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, wrapperClassName, id, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
      <div className={cn("flex w-full flex-col gap-2", wrapperClassName)}>
        {label && (
          <label htmlFor={textareaId} className="overline">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            "font-ui w-full bg-surface-2 text-text-primary py-3 px-4 rounded-md text-base outline-none border resize-none transition-colors duration-normal ease-default",
            "focus:border-lime-border focus:ring-4 focus:ring-lime-glow placeholder:text-text-secondary",
            error ? "border-error" : "border-border",
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error && <span className="font-ui text-sm text-error">{error}</span>}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
