import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ownerApi } from "@/api/panels";
import { stadiumsApi } from "@/api/stadiums";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { BookingStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateWithWeekday, formatMoney, formatTime, toISODate } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

const WEEKDAY_HEADERS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const ALL = "all";

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

export function OwnerCalendarPage() {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });
  const [stadium, setStadium] = useState("");
  const [selected, setSelected] = useState<string | null>(toISODate(today));

  const myStadiums = useQuery({
    queryKey: ["stadiums", { mine: true, page_size: 100 }],
    queryFn: () => stadiumsApi.list({ mine: true, page_size: 100 }),
  });

  const calendar = useQuery({
    queryKey: ["owner", "calendar", cursor, stadium],
    queryFn: () =>
      ownerApi.calendar({ ...cursor, ...(stadium ? { stadium } : {}) }),
    placeholderData: (previous) => previous,
  });

  const shift = (delta: number) =>
    setCursor((current) => {
      const next = new Date(current.year, current.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });

  const days = calendar.data?.days ?? {};
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const blanks = leadingBlanks(cursor.year, cursor.month);
  const selectedBookings = selected ? (days[selected] ?? []) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kalendar</h1>
          <p className="text-sm text-muted-foreground">Oylik band vaqtlar ko'rinishi.</p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={stadium || ALL} onValueChange={(value) => setStadium(value === ALL ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Barcha stadionlar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Barcha stadionlar</SelectItem>
              {myStadiums.data?.results.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" aria-label="Oldingi oy" onClick={() => shift(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <p className="text-lg font-semibold">
              {MONTHS[cursor.month - 1]} {cursor.year}
            </p>
            <Button variant="ghost" size="icon" aria-label="Keyingi oy" onClick={() => shift(1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {calendar.isError ? (
            <ErrorState
              message="Kalendarni yuklab bo'lmadi."
              onRetry={() => void calendar.refetch()}
            />
          ) : calendar.isLoading ? (
            <PageLoader className="py-12" />
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                {WEEKDAY_HEADERS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: blanks }).map((_, index) => (
                  <div key={`blank-${index}`} />
                ))}

                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1;
                  const iso = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const bookings = days[iso] ?? [];
                  const isToday = iso === toISODate(today);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSelected(iso)}
                      className={cn(
                        "flex min-h-[68px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors hover:bg-accent",
                        selected === iso && "border-primary ring-1 ring-primary",
                        isToday && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isToday && "text-primary",
                        )}
                      >
                        {day}
                      </span>
                      {bookings.length > 0 && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {bookings.length} bron
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">{formatDateWithWeekday(selected)}</p>
            {selectedBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu kunga bron yo'q.</p>
            ) : (
              selectedBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {formatTime(booking.start_time)} — {formatTime(booking.end_time)} ·{" "}
                      {booking.stadium}
                    </p>
                    <p className="text-muted-foreground">
                      {booking.customer} · #{booking.reference}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">
                      {formatMoney(booking.total_price)} so'm
                    </span>
                    <BookingStatusBadge status={booking.status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
