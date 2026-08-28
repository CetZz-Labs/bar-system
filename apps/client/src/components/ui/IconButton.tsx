import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";
import React from "react";
import { cn } from "@/utils/cn";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "surface" | "ghost" | "outline";
  size?: "sm" | "md";
  /** Obligatorio: describe el resultado de la accion (`docs/design.md` §5). */
  "aria-label": string;
}

const VARIANT_CLASSES: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  surface: "bg-surface-2 border border-border hover:bg-surface-3",
  ghost: "bg-transparent hover:bg-surface-2",
  outline: "bg-transparent border border-border hover:border-border-hover",
};

const SIZE_CLASSES: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "w-9 h-9",
  md: "w-10 h-10",
};

/**
 * Boton circular solo-icono. Unifica las 3 variantes divergentes del boton
 * "volver" (`w-10 h-10` con hover, `w-9 h-9` sin hover, etc.). El
 * `aria-label` es obligatorio por tipos.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "surface", size = "md", className, children, type = "button", ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        type={type}
        className={cn(
          "flex items-center justify-center rounded-full text-text-primary cursor-pointer transition-colors duration-normal ease-default shrink-0",
          "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-border",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        whileTap={{ scale: 0.97 }}
        {...(props as HTMLMotionProps<"button">)}
      >
        {children}
      </motion.button>
    );
  },
);
IconButton.displayName = "IconButton";
