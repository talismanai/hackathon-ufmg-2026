import { forwardRef, type ButtonHTMLAttributes } from "react";

import {
  buttonStyles,
  type ButtonStyleOptions,
} from "@/components/ui/buttonStyles";
import { Spinner } from "@/components/ui/Spinner";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonStyleOptions {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      isLoading = false,
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={buttonStyles({ variant, size, fullWidth, className })}
        disabled={disabled || isLoading}
        type={type}
        {...props}
      >
        {isLoading ? <Spinner className="h-4 w-4" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
