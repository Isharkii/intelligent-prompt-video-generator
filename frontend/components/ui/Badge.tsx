import { clsx } from "clsx";

type BadgeVariant = "amber" | "success" | "warning" | "error" | "muted";

const variantClasses: Record<BadgeVariant, string> = {
  amber:   "bg-[var(--amber-glow)] text-amber border-[var(--amber-dim)]",
  success: "bg-green-950/50 text-green-400 border-green-800",
  warning: "bg-yellow-950/50 text-yellow-400 border-yellow-800",
  error:   "bg-red-950/50 text-red-400 border-red-800",
  muted:   "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = "muted", children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center font-mono text-[10px] tracking-wider",
        "px-2 py-0.5 rounded-sm border",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
