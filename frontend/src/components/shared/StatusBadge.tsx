import {
  BOOKING_STATUS_CLASS,
  BOOKING_STATUS_LABEL,
  STADIUM_STATUS_CLASS,
  STADIUM_STATUS_LABEL,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BookingStatus, StadiumStatus } from "@/types/api";

const base =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function BookingStatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  return (
    <span className={cn(base, BOOKING_STATUS_CLASS[status], className)}>
      {BOOKING_STATUS_LABEL[status]}
    </span>
  );
}

export function StadiumStatusBadge({
  status,
  className,
}: {
  status: StadiumStatus;
  className?: string;
}) {
  return (
    <span className={cn(base, STADIUM_STATUS_CLASS[status], className)}>
      {STADIUM_STATUS_LABEL[status]}
    </span>
  );
}
