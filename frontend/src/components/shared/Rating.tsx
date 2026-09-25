import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function Rating({
  value,
  count,
  size = "sm",
  className,
}: {
  value: string | number;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const numeric = typeof value === "string" ? Number(value) : value;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Star className={cn(iconSize, "fill-warning text-warning")} />
      <span className={cn("font-semibold", size === "sm" ? "text-xs" : "text-sm")}>
        {Number.isFinite(numeric) ? numeric.toFixed(1) : "0.0"}
      </span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
    </span>
  );
}

/** Interactive 1–5 picker for the review form. */
export function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          aria-label={`${star} yulduz`}
          className="rounded p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
        >
          <Star
            className={cn(
              "h-7 w-7 transition-colors",
              star <= value ? "fill-warning text-warning" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}
