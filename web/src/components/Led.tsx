import { cn } from "@/lib/utils";

export type LedColor = "primary" | "green" | "red" | "dim";

const LED_STYLES: Record<LedColor, string> = {
  primary: "bg-primary shadow-[0_0_6px_var(--color-primary)]",
  green: "bg-success shadow-[0_0_6px_var(--color-success)]",
  red: "bg-destructive shadow-[0_0_6px_var(--color-destructive)]",
  dim: "bg-muted-foreground/40",
};

export function Led({
  color,
  pulse = false,
  className,
}: {
  color: LedColor;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", LED_STYLES[color], pulse && "animate-pulse", className)}
    />
  );
}
