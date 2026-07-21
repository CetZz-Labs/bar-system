import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";
import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger" | "apple" | "google" | "surface";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth = false, className = "", children, ...props }, ref) => {
    
    // Base classes
    const baseClasses = "font-ui flex items-center justify-center gap-2 cursor-pointer outline-none transition-colors duration-normal ease-default";
    
    // Variant classes
    const variantClasses = {
      primary: "bg-lime text-bg font-bold",
      surface: "bg-surface-2 text-text-primary font-medium",
      ghost: "bg-transparent text-text-secondary font-medium hover:bg-surface-2",
      outline: "bg-transparent text-text-primary border border-border font-medium hover:border-border-hover",
      danger: "bg-error-dim text-error border border-error-border font-medium",
      google: "bg-transparent text-text-primary border border-border font-medium hover:border-border-hover",
      apple: "bg-transparent text-text-primary border border-border font-medium hover:border-border-hover",
    }[variant] || "";

    // Size classes
    const sizeClasses = {
      sm: "px-4 py-2 text-sm rounded-md",
      md: "px-5 py-[14px] text-base rounded-md",
      lg: "px-6 py-4 text-md rounded-md",
    }[size] || "";

    const widthClass = fullWidth ? "w-full" : "w-auto";

    return (
      <motion.button
        ref={ref}
        className={`${baseClasses} ${variantClasses} ${sizeClasses} ${widthClass} ${className}`}
        whileTap={{ scale: 0.97 }}
        {...props as HTMLMotionProps<"button">}
      >
        {children}
      </motion.button>
    );
  }
);
Button.displayName = "Button";
