type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: ButtonStyleOptions = {}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[8px] border font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/25 disabled:cursor-not-allowed disabled:opacity-60";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "border-brand-navy bg-brand-navy text-white shadow-[0_12px_24px_rgba(15,32,68,0.18)] hover:border-brand-navy-deep hover:bg-brand-navy-deep",
    secondary:
      "border-border-soft bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
    ghost:
      "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
  };

  const sizes: Record<ButtonSize, string> = {
    sm: "min-h-10 px-3.5 text-sm",
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-12 px-5 text-base",
  };

  return [base, variants[variant], sizes[size], fullWidth ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}
