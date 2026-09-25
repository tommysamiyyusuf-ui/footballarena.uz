const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

const WEEKDAYS_UZ = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];

/** `"150000.00"` -> `"150 000"`. Money arrives from the API as a string. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return "0";
  return Math.round(numeric)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatSum(value: string | number | null | undefined): string {
  return `${formatMoney(value)} so'm`;
}

/** Compact form for dashboard tiles: 1 250 000 -> "1.25 mln". */
export function formatCompactSum(value: string | number | null | undefined): string {
  const numeric = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!numeric || Number.isNaN(numeric)) return "0 so'm";
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(2)} mlrd so'm`;
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(2)} mln so'm`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(0)} ming so'm`;
  return `${Math.round(numeric)} so'm`;
}

function parse(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-09-02` -> `2 sentabr 2026`. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parse(value);
  if (!date) return "—";
  return `${date.getDate()} ${MONTHS_UZ[date.getMonth()]} ${date.getFullYear()}`;
}

/** `2026-09-02` -> `2 sentabr, Chorshanba`. */
export function formatDateWithWeekday(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parse(value);
  if (!date) return "—";
  return `${date.getDate()} ${MONTHS_UZ[date.getMonth()]}, ${WEEKDAYS_UZ[date.getDay()]}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parse(value);
  if (!date) return "—";
  return `${formatDate(date)}, ${formatTime(date)}`;
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = parse(value);
  if (!date) return "—";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "2 daqiqa oldin", "3 soat oldin", ... */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = parse(value ?? "");
  if (!date) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "hozirgina";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} kun oldin`;
  return formatDate(date);
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** `+998901234567` -> `+998 90 123 45 67`. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 12) return phone;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
}

/** Local `YYYY-MM-DD`. `toISOString()` would shift the day in UTC+5. */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
