import { forwardRef, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={[
          "min-h-11 w-full rounded-[8px] border border-border-soft bg-white px-4 text-sm text-slate-900 shadow-[0_4px_16px_rgba(15,32,68,0.04)] outline-none transition placeholder:text-slate-400 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
