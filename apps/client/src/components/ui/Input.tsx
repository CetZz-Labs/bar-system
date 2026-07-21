import React, { forwardRef } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, rightIcon, className = "", ...props }, ref) => {
    
    return (
      <div className={`flex flex-col gap-2 w-full ${className}`}>
        {label && (
          <label className="overline">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-4 text-text-secondary pointer-events-none">
              {icon}
            </div>
          )}
          
          <input
            ref={ref}
            className={`font-ui w-full bg-surface-2 text-text-primary py-4 rounded-md text-base outline-none transition-all duration-normal ease-default
              ${icon ? "pl-12" : "pl-4"}
              ${rightIcon ? "pr-12" : "pr-4"}
              ${error ? "border border-error" : "border border-border"}
              focus:border-lime-border focus:ring-4 focus:ring-lime-glow placeholder:text-text-secondary`}
            {...props}
          />

          {rightIcon && (
            <div className="absolute right-4 text-text-secondary">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <span className="font-ui text-sm text-error">
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
