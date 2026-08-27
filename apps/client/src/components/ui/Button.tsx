import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";
import React from "react";
import { cn } from "@/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger" | "apple" | "google" | "surface";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-lime text-bg font-bold",
  surface: "bg-surface-2 text-text-primary font-medium",
  ghost: "bg-transparent text-text-secondary font-medium hover:bg-surface-2",
  outline: "bg-transparent text-text-primary border border-border font-medium hover:border-border-hover",
  danger: "bg-error-dim text-error border border-error-border font-medium",
  google: "bg-transparent text-text-primary border border-border font-medium hover:border-border-hover",
  apple: "bg-transparent text-text-primary border border-border font-medium hover:border-border-hover",
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-4 py-2 text-sm rounded-md",
  md: "px-5 py-[14px] text-base rounded-md",
  lg: "px-6 py-4 text-md rounded-md",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth = false, className, children, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        className={cn(
          "font-ui flex items-center justify-center gap-2 cursor-pointer outline-none transition-colors duration-normal ease-default",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth ? "w-full" : "w-auto",
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
Button.displayName = "Button";
