"use client";

import { forwardRef } from "react";
import { clsx } from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "w-full h-10 px-3 font-sans text-sm text-[var(--text)]",
            "bg-[var(--bg-elevated)] border rounded-sm",
            "placeholder:text-[var(--text-dim)]",
            "transition-colors duration-150",
            "focus:outline-none focus:border-amber",
            error
              ? "border-red-600"
              : "border-[var(--border)] hover:border-[var(--text-dim)]",
            className
          )}
          {...props}
        />
        {error && (
          <p className="font-mono text-[11px] text-red-400">{error}</p>
        )}
        {hint && !error && (
          <p className="font-mono text-[11px] text-[var(--text-dim)]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
