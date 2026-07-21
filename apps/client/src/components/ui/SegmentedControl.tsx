import React from "react";

interface SegmentedControlOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  name: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export const SegmentedControl = React.forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ options, value, onChange, name, label, error, disabled }, ref) => {
    return (
      <div className={`flex flex-col gap-2 w-full ${disabled ? "opacity-60" : ""}`} ref={ref}>
        {label && (
          <label className="overline">{label}</label>
        )}
        <div
          className="flex w-full rounded-md bg-surface-2 border border-border p-1 gap-1"
          role="radiogroup"
          aria-label={name}
          aria-disabled={disabled}
        >
          {options.map((option) => {
            const isActive = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={disabled}
                onClick={() => !disabled && onChange(option.value)}
                className={`flex-1 py-3 px-2 rounded-md text-sm font-ui font-medium transition-all duration-normal ease-default
                  ${isActive
                    ? "bg-lime text-bg shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
                  }
                  ${disabled ? "cursor-not-allowed" : ""}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {error && (
          <span className="font-ui text-sm text-error">{error}</span>
        )}
      </div>
    );
  }
);
SegmentedControl.displayName = "SegmentedControl";
