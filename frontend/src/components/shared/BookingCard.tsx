import { CalendarDays, Clock, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { BookingStatusBadge } from "@/components/shared/StatusBadge";
import { formatDateWithWeekday, formatMoney, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingListItem } from "@/types/api";

interface BookingCardProps {
  booking: BookingListItem;
  /** Omit to render a plain card — owner lists open a dialog instead. */
  to?: string;
  /** Approve/reject buttons in the owner panel. */
  actions?: ReactNode;
  className?: string;
}

export function BookingCard({ booking, to, actions, className }: BookingCardProps) {
  const body = (
    <div className="flex gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        {booking.stadium.cover_image ? (
          <img
            src={booking.stadium.cover_image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold">{booking.stadium.name}</p>
          <BookingStatusBadge status={booking.status} />
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {formatDateWithWeekday(booking.date)}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {formatTime(booking.start_time)} — {formatTime(booking.end_time)} ({booking.duration_hours}{" "}
          soat)
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {booking.stadium.district ? `${booking.stadium.district}, ` : ""}
            {booking.stadium.city}
          </span>
        </p>

        <div className="flex items-center justify-between pt-1">
          <span className="font-bold text-primary">
            {formatMoney(booking.total_price)} so'm
          </span>
          <span className="text-xs text-muted-foreground">#{booking.reference}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card p-4 transition-shadow hover:shadow-lg hover:shadow-primary/5",
        className,
      )}
    >
      {to ? (
        <Link to={to} className="block transition-opacity hover:opacity-90">
          {body}
        </Link>
      ) : (
        body
      )}
      {actions && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/80 pt-4">{actions}</div>
      )}
    </div>
  );
}
