import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarX2, Check, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { bookingsApi } from "@/api/bookings";
import { stadiumsApi } from "@/api/stadiums";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfig } from "@/hooks/useConfig";
import { errorMessage, slotAlternatives } from "@/lib/api";
import { addDays, formatDateWithWeekday, formatMoney, formatTime, toISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { SlotSuggestion } from "@/types/api";

/** `"18:00"` + 2 -> `"20:00"`. The backend computes the real end time. */
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  return `${String((h + hours) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function BookingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { data: config } = useConfig();

  const minDuration = config?.booking.min_duration_hours ?? 1;
  const maxDuration = config?.booking.max_duration_hours ?? 4;
  const maxAdvance = config?.booking.max_advance_days ?? 30;

  const [date, setDate] = useState(() => toISODate(new Date()));
  const [startTime, setStartTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(minDuration);
  const [note, setNote] = useState("");
  const [players, setPlayers] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [conflict, setConflict] = useState<{ message: string; alternatives: SlotSuggestion[] } | null>(
    null,
  );

  const stadium = useQuery({
    queryKey: ["stadium", id],
    queryFn: () => stadiumsApi.detail(id),
    enabled: Boolean(id),
  });

  const availability = useQuery({
    queryKey: ["availability", id, date],
    queryFn: () => stadiumsApi.availability(id, date),
    enabled: Boolean(id && date),
  });

  const slots = availability.data?.slots ?? [];

  // A slot chosen for one day means nothing on another.
  useEffect(() => {
    setStartTime(null);
    setConflict(null);
  }, [date]);

  const availableStarts = useMemo(
    () => new Set(slots.filter((slot) => slot.is_available).map((slot) => slot.start_time)),
    [slots],
  );

  /** Longest run of free hours from a start — caps the duration picker. */
  const maxRunFrom = (start: string): number => {
    let run = 0;
    let cursor = start;
    while (run < maxDuration && availableStarts.has(cursor)) {
      run += 1;
      cursor = addHours(cursor, 1);
    }
    return run;
  };

  const runLength = startTime ? maxRunFrom(startTime) : 0;
  const durationOptions = Array.from(
    { length: Math.max(0, Math.min(maxDuration, runLength) - minDuration + 1) },
    (_, index) => minDuration + index,
  );

  useEffect(() => {
    if (startTime && duration > runLength) setDuration(Math.max(minDuration, runLength));
  }, [startTime, runLength, duration, minDuration]);

  const quote = useQuery({
    queryKey: ["quote", id, duration],
    queryFn: () => bookingsApi.quote(id, duration),
    enabled: Boolean(id && startTime && duration >= minDuration),
  });

  const create = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        stadium_id: id,
        date,
        start_time: startTime as string,
        duration_hours: duration,
        customer_note: note.trim() || undefined,
        contact_phone: phone.trim() || undefined,
        players_count: players ? Number(players) : undefined,
      }),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["availability", id] });
      toast.success("So'rov yuborildi. Stadion egasi tasdiqlashini kuting.");
      navigate(`/bookings/${booking.id}`, { replace: true });
    },
    onError: (error) => {
      const alternatives = slotAlternatives(error);
      if (alternatives.length > 0) {
        setConflict({ message: errorMessage(error), alternatives });
      } else {
        toast.error(errorMessage(error));
      }
      // The slot grid is stale the moment someone else takes a slot.
      void availability.refetch();
    },
  });

  if (stadium.isLoading) return <PageLoader className="py-24" />;
  if (stadium.isError || !stadium.data) {
    return (
      <div className="container py-10">
        <ErrorState message="Stadion topilmadi." onRetry={() => void stadium.refetch()} />
      </div>
    );
  }

  const days = Array.from({ length: Math.min(maxAdvance, 30) }, (_, index) =>
    addDays(new Date(), index),
  );
  const canSubmit = Boolean(startTime) && duration >= minDuration && !create.isPending;

  return (
    <div className="container max-w-4xl space-y-6 py-6">
      <button
        type="button"
        onClick={() => navigate(`/stadiums/${id}`)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {stadium.data.name}
      </button>

      <div>
        <h1 className="text-2xl font-bold">Bron qilish</h1>
        <p className="text-sm text-muted-foreground">
          Sanani va boshlanish vaqtini tanlang — narx avtomatik hisoblanadi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Sana</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map((day) => {
              const value = toISODate(day);
              const active = value === date;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDate(value)}
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-border/80 py-2 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  <span className="text-[11px] uppercase opacity-70">
                    {["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"][day.getDay()]}
                  </span>
                  <span className="text-base font-semibold">{day.getDate()}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm font-medium">{formatDateWithWeekday(date)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Boshlanish vaqti</CardTitle>
        </CardHeader>
        <CardContent>
          {availability.isLoading ? (
            <PageLoader className="py-8" />
          ) : availability.isError ? (
            <ErrorState
              message="Bo'sh vaqtlarni yuklab bo'lmadi."
              onRetry={() => void availability.refetch()}
            />
          ) : !availability.data?.is_open ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <CalendarX2 className="h-8 w-8" />
              Bu kuni stadion yopiq. Boshqa sanani tanlang.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {slots.map((slot) => {
                  const active = slot.start_time === startTime;
                  return (
                    <button
                      key={slot.start_time}
                      type="button"
                      disabled={!slot.is_available}
                      title={slot.is_available ? undefined : slot.reason || "Band"}
                      onClick={() => {
                        setStartTime(slot.start_time);
                        setConflict(null);
                      }}
                      className={cn(
                        "rounded-full border border-border/80 py-2 text-sm font-medium transition-colors",
                        active && "border-primary bg-primary text-primary-foreground",
                        !active && slot.is_available && "hover:bg-accent",
                        !slot.is_available &&
                          "cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60",
                      )}
                    >
                      {formatTime(slot.start_time)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Ish vaqti: {formatTime(availability.data.open_time)} —{" "}
                {formatTime(availability.data.close_time)}. O'chirilgan vaqtlar allaqachon band.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {startTime && (
        <Card>
          <CardHeader>
            <CardTitle>3. Davomiylik</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {durationOptions.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setDuration(hours)}
                  className={cn(
                    "rounded-full border border-border/80 px-4 py-2 text-sm font-medium transition-colors",
                    hours === duration
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {hours} soat
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {formatTime(startTime)} — {addHours(startTime, duration)}
            </p>
            {runLength < maxDuration && (
              <p className="text-xs text-muted-foreground">
                Keyingi soat band bo'lgani uchun maksimal {runLength} soat tanlash mumkin.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>4. Qo'shimcha ma'lumot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact_phone">Bog'lanish uchun telefon</Label>
            <Input
              id="contact_phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+998 90 123 45 67"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="players">O'yinchilar soni</Label>
            <Input
              id="players"
              inputMode="numeric"
              value={players}
              onChange={(event) => setPlayers(event.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="10"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="note">Izoh</Label>
            <Textarea
              id="note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Stadion egasiga qo'shimcha izoh (ixtiyoriy)"
            />
          </div>
        </CardContent>
      </Card>

      {conflict && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-3 pt-6">
            <p className="flex items-start gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {conflict.message}
            </p>
            <div>
              <p className="mb-2 text-sm font-medium">Bo'sh vaqtlar:</p>
              <div className="flex flex-wrap gap-2">
                {conflict.alternatives.map((alternative) => (
                  <button
                    key={alternative.start_time}
                    type="button"
                    onClick={() => {
                      setStartTime(alternative.start_time);
                      setConflict(null);
                    }}
                    className="rounded-full border border-border/80 bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    {formatTime(alternative.start_time)} — {formatTime(alternative.end_time)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatMoney(alternative.total_price)} so'm
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="sticky bottom-16 z-20 rounded-2xl shadow-lg shadow-primary/5 md:bottom-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="text-xs text-muted-foreground">Jami to'lov</p>
            <p className="text-2xl font-bold text-primary">
              {quote.data
                ? `${formatMoney(quote.data.total_price)} so'm`
                : `${formatMoney(Number(stadium.data.price_per_hour) * duration)} so'm`}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatMoney(stadium.data.price_per_hour)} so'm × {duration} soat
            </p>
          </div>
          <Button
            size="lg"
            className="rounded-full"
            loading={create.isPending}
            disabled={!canSubmit}
            onClick={() => create.mutate()}
          >
            <Check className="h-4 w-4" />
            So'rov yuborish
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Yakuniy narxni server hisoblaydi. So'rov stadion egasi tasdiqlagandan keyin kuchga
        kiradi.
      </p>
    </div>
  );
}
