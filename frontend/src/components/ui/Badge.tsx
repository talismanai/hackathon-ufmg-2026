import type { HTMLAttributes } from "react";

type BadgeTone = "default" | "success" | "warning" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({
  tone = "default",
  className = "",
  children,
  ...props
}: BadgeProps) {
  const tones: Record<BadgeTone, string> = {
    default: "border-slate-200 bg-slate-100 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
        tones[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
