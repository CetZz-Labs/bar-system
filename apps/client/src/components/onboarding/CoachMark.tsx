import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { dismiss, wasDismissed } from "@/utils/firstVisit";
import { cn } from "@/utils/cn";

interface CoachMarkProps {
  storageKey: string;
  title: string;
  body: string;
  /** Posición relativa al contenedor padre (`relative`). */
  placement?: "top" | "bottom";
  className?: string;
}

/**
 * LB-91: tooltip flotante one-shot en primera visita a una pantalla.
 */
export function CoachMark({
  storageKey,
  title,
  body,
  placement = "bottom",
  className,
}: CoachMarkProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!wasDismissed(storageKey)) {
      setVisible(true);
    }
  }, [storageKey]);

  const close = () => {
    dismiss(storageKey);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: placement === "bottom" ? -6 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={cn(
            "absolute z-30 max-w-[260px] rounded-lg border border-lime/40 bg-surface-2 p-3 shadow-lg",
            placement === "bottom" ? "top-full mt-2 left-0" : "bottom-full mb-2 left-0",
            className
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary m-0">{title}</p>
              <p className="text-xs text-text-secondary m-0 mt-1">{body}</p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={close}
              className="shrink-0 rounded-full p-1 text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={close}
            className="mt-2 text-xs text-lime bg-transparent border-0 cursor-pointer p-0"
          >
            Entendido
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
