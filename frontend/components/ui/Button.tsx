"use client";

import { forwardRef } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-amber text-[#0a0a0a] font-semibold hover:bg-yellow-400 active:scale-[0.98] disabled:bg-[var(--amber-dim)] disabled:text-[#0a0a0a]/50",
  secondary:
    "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--amber-dim)] hover:text-amber active:scale-[0.98]",
  ghost:
    "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] active:scale-[0.98]",
  danger:
    "bg-transparent text-red-400 border border-red-800 hover:bg-red-950 hover:border-red-600 active:scale-[0.98]",
};

const sizeClasses: Record<Size, string> = {
  sm:  "h-8  px-3 text-xs  rounded-sm gap-1.5",
  md:  "h-10 px-4 text-sm  rounded-sm gap-2",
  lg:  "h-12 px-6 text-base rounded-sm gap-2",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center font-mono tracking-wider",
          "transition-all duration-150 cursor-pointer select-none",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>WORKING</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
