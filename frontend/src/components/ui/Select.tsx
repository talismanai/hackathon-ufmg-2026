import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", options, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={[
          "min-h-11 w-full rounded-[8px] border border-border-soft bg-white px-4 text-sm text-slate-900 shadow-[0_4px_16px_rgba(15,32,68,0.04)] outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
);

Select.displayName = "Select";
