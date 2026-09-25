import { Heart, MapPin, Navigation } from "lucide-react";
import { Link } from "react-router-dom";

import { Rating } from "@/components/shared/Rating";
import { StadiumStatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavoriteToggle } from "@/hooks/useFavorite";
import { FIELD_TYPE_LABEL } from "@/lib/constants";
import { formatDistance, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StadiumListItem } from "@/types/api";

interface StadiumCardProps {
  stadium: StadiumListItem;
  /** Owner and admin lists show moderation status instead of the heart. */
  showStatus?: boolean;
  to?: string;
  className?: string;
}

export function StadiumCard({ stadium, showStatus, to, className }: StadiumCardProps) {
  const { toggle, isPending } = useFavoriteToggle();

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5",
        className,
      )}
    >
      <Link to={to ?? `/stadiums/${stadium.id}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {stadium.cover_image ? (
            <img
              src={stadium.cover_image}
              alt={stadium.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Rasm yo'q
            </div>
          )}

          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur">
              {FIELD_TYPE_LABEL[stadium.field_type] ?? stadium.field_type_display}
            </span>
            {showStatus && <StadiumStatusBadge status={stadium.status} className="bg-background/95" />}
            {!stadium.is_active && showStatus && (
              <span className="rounded-full bg-background/95 px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                Faol emas
              </span>
            )}
          </div>

          {stadium.distance_km !== null && stadium.distance_km !== undefined && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur">
              <Navigation className="h-3 w-3 text-primary" />
              {formatDistance(stadium.distance_km)}
            </span>
          )}
        </div>

        <div className="space-y-2 p-4">
          <h3 className="line-clamp-1 font-semibold">{stadium.name}</h3>

          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-1">
              {stadium.district ? `${stadium.district}, ` : ""}
              {stadium.city}
            </span>
          </p>

          <div className="flex items-center justify-between pt-1">
            <p className="text-base font-bold text-primary">
              {formatMoney(stadium.price_per_hour)}{" "}
              <span className="text-xs font-medium text-muted-foreground">so'm/soat</span>
            </p>
            <Rating value={stadium.rating} count={stadium.review_count} />
          </div>
        </div>
      </Link>

      {!showStatus && (
        <button
          type="button"
          aria-label={stadium.is_favorite ? "Sevimlilardan olish" : "Sevimlilarga qo'shish"}
          disabled={isPending}
          onClick={() => toggle(stadium.id)}
          className="absolute right-2 top-2 rounded-full bg-background/90 p-2 shadow-sm backdrop-blur transition-colors hover:bg-background disabled:opacity-60"
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-colors",
              stadium.is_favorite ? "fill-destructive text-destructive" : "text-muted-foreground",
            )}
          />
        </button>
      )}
    </div>
  );
}

export function StadiumCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Skeleton className="aspect-[16/10] rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}
