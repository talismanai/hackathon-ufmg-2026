interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = "" }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
