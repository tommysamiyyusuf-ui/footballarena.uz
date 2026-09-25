import type { BookingStatus, FieldType, StadiumStatus } from "@/types/api";

export const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "MINI", label: "Mini maydon" },
  { value: "F5", label: "5x5" },
  { value: "F7", label: "7x7" },
  { value: "F11", label: "11x11" },
];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  MINI: "Mini maydon",
  F5: "5x5",
  F7: "7x7",
  F11: "11x11",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Kutilmoqda",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
  CANCELLED: "Bekor qilingan",
  COMPLETED: "Yakunlangan",
  EXPIRED: "Muddati o'tgan",
};

/** Tailwind classes, not colour names — the badge component pastes these in. */
export const BOOKING_STATUS_CLASS: Record<BookingStatus, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/25",
  APPROVED: "bg-success/10 text-success border-success/25",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/25",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  COMPLETED: "bg-primary/10 text-primary border-primary/25",
  EXPIRED: "bg-muted text-muted-foreground border-border",
};

export const STADIUM_STATUS_LABEL: Record<StadiumStatus, string> = {
  PENDING: "Moderatsiyada",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
  BLOCKED: "Bloklangan",
};

export const STADIUM_STATUS_CLASS: Record<StadiumStatus, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/25",
  APPROVED: "bg-success/10 text-success border-success/25",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/25",
  BLOCKED: "bg-destructive/10 text-destructive border-destructive/25",
};

export const WEEKDAYS = [
  { value: 0, label: "Dushanba", short: "Du" },
  { value: 1, label: "Seshanba", short: "Se" },
  { value: 2, label: "Chorshanba", short: "Ch" },
  { value: 3, label: "Payshanba", short: "Pa" },
  { value: 4, label: "Juma", short: "Ju" },
  { value: 5, label: "Shanba", short: "Sh" },
  { value: 6, label: "Yakshanba", short: "Ya" },
];

export const RADIUS_OPTIONS = [
  { value: "1", label: "1 km" },
  { value: "3", label: "3 km" },
  { value: "5", label: "5 km" },
  { value: "10", label: "10 km" },
];

export const PRICE_OPTIONS = [
  { value: "100000", label: "100 ming so'mgacha" },
  { value: "200000", label: "200 ming so'mgacha" },
  { value: "300000", label: "300 ming so'mgacha" },
];

export const RATING_OPTIONS = [
  { value: "4", label: "4+ yulduz" },
  { value: "4.5", label: "4.5+ yulduz" },
];

export const SORT_OPTIONS = [
  { value: "", label: "Tavsiya etilgan" },
  { value: "-rating", label: "Reyting bo'yicha" },
  { value: "price_per_hour", label: "Arzon narx" },
  { value: "-price_per_hour", label: "Qimmat narx" },
  { value: "-review_count", label: "Ko'p sharhlangan" },
  { value: "-created_at", label: "Yangi qo'shilgan" },
];

/** Tashkent — the map centre when the browser refuses geolocation. */
export const DEFAULT_CENTER = { lat: 41.2995, lng: 69.2401 };

export const AMENITY_ICON: Record<string, string> = {
  parking: "car",
  shower: "shower-head",
  locker: "lock",
  lighting: "lightbulb",
  wifi: "wifi",
  cafe: "coffee",
  tribune: "users",
  ball: "circle-dot",
  wc: "door-open",
  security: "shield-check",
};
