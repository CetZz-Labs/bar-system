import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "./Button";
import { IconButton } from "./IconButton";
import { cn } from "@/utils/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Contenido del cuerpo (form, lista, etc.). */
  children?: React.ReactNode;
  isPending?: boolean;
  /** Ancho maximo del panel. Default `sm`. */
  size?: "sm" | "md" | "lg";
  /** Muestra una "X" de cierre arriba a la derecha (`aria-label="Cerrar"`). Default `false`. */
  showCloseButton?: boolean;

  /* ── Modo confirm-dialog (retrocompatible) ── */
  /** Si se pasa, se renderiza el footer por defecto Cancelar / Confirmar. */
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  /** Variante del boton de confirmacion. Default `danger`. */
  confirmVariant?: ButtonProps["variant"];

  /* ── Modo formulario / contenido libre ── */
  /** Footer custom (ej. botones de submit de un form). Anula el footer default. */
  footer?: React.ReactNode;
  /** Oculta cualquier footer (el children provee sus propias acciones). */
  hideFooter?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmVariant = "danger",
  isPending = false,
  size = "sm",
  showCloseButton = false,
  footer,
  hideFooter = false,
  children,
}: ModalProps) {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Cierre con tecla Escape mientras el modal esta abierto. Focus-trap
  // completo / restaurar foco al disparador quedan como follow-up (a11y mas
  // grande): ver docs/design.md §5.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const showDefaultFooter = !hideFooter && !footer && typeof onConfirm === "function";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-overlay backdrop-blur-sm" />

          {/* Modal content */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "relative w-full bg-surface rounded-xl border border-border p-6 shadow-modal max-h-[85vh] overflow-y-auto",
              SIZE_CLASSES[size],
            )}
          >
            <h2
              id="modal-title"
              className={cn(
                "text-xl font-display font-bold tracking-tight text-text-primary mb-2",
                showCloseButton && "pr-10",
              )}
            >
              {title}
            </h2>

            {showCloseButton && (
              <IconButton
                size="sm"
                aria-label="Cerrar"
                onClick={onClose}
                className="absolute top-4 right-4"
              >
                <X size={16} className="text-text-secondary" />
              </IconButton>
            )}

            {description && (
              <p className="text-text-secondary text-base mb-6">{description}</p>
            )}
            {children}

            {showDefaultFooter && (
              <div className="flex gap-3 mt-6">
                <Button
                  variant="surface"
                  size="md"
                  fullWidth
                  onClick={onClose}
                  disabled={isPending}
                >
                  {cancelText}
                </Button>
                <Button
                  variant={confirmVariant}
                  size="md"
                  fullWidth
                  onClick={onConfirm}
                  disabled={isPending}
                >
                  {confirmText}
                </Button>
              </div>
            )}

            {!hideFooter && footer && <div className="mt-6">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
