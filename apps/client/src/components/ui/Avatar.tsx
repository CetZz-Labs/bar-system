import React from "react";
import { resolveImageUrl } from "@/utils/resolveImageUrl";

export interface AvatarProps {
  src?: string;
  alt: string;
  size?: "sm" | "md" | "lg";
  fallback?: React.ReactNode;
  className?: string;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-base",
  lg: "w-24 h-24 text-2xl",
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, size = "md", fallback, className = "" }, ref) => {
    const [hasError, setHasError] = React.useState(false);

    const resolvedSrc = React.useMemo(() => resolveImageUrl(src), [src]);
    const showFallback = !resolvedSrc || hasError;

    return (
      <div
        ref={ref}
        className={`relative inline-flex items-center justify-center rounded-full overflow-hidden bg-surface-2 border border-border ${sizeClasses[size]} ${className}`}
      >
        {!showFallback && (
          <img
            src={resolvedSrc}
            alt={alt}
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        )}
        {showFallback && (
          <span
            className="font-display font-bold text-text-secondary select-none"
            aria-label={alt}
            role="img"
          >
            {fallback ?? getInitials(alt)}
          </span>
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";
