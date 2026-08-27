import { cn } from "@/utils/cn";
import { Button } from "./Button";

export interface ErrorStateProps {
  /** Titulo del error. Default: "No pudimos cargar la informacion." */
  title?: string;
  description?: string;
  /** Handler de reintento. Si se pasa, muestra el boton "Reintentar". */
  onRetry?: () => void;
  retryLabel?: string;
  /** Handler de "volver". Si se pasa, muestra un boton ghost secundario. */
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

/**
 * Estado de error unificado para vistas. SIN animacion de entrada
 * (`docs/design.md` §3): aparece de forma instantanea. Reemplaza los bloques
 * `<p className="text-error">Error al cargar ...</p> + <Button>` dispersos.
 * El copy sigue el catalogo de `docs/design.md` ("No pudimos cargar ...").
 */
export function ErrorState({
  title = "No pudimos cargar la informacion.",
  description,
  onRetry,
  retryLabel = "Reintentar",
  onBack,
  backLabel = "Volver",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold text-error">{title}</p>
        {description && (
          <p className="max-w-xs text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {(onRetry || onBack) && (
        <div className="flex items-center gap-3">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              {backLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
