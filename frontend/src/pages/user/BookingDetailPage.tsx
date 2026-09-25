import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, MessageSquare, Phone, Star } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { bookingsApi } from "@/api/bookings";
import { chatApi, reviewsApi } from "@/api/misc";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RatingInput } from "@/components/shared/Rating";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { BookingStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import {
  formatDateTime,
  formatDateWithWeekday,
  formatMoney,
  formatPhone,
  formatTime,
} from "@/lib/format";

export function BookingDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const booking = useQuery({
    queryKey: ["booking", id],
    queryFn: () => bookingsApi.detail(id),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["booking", id] });
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };

  const cancel = useMutation({
    mutationFn: (reason: string) => bookingsApi.cancel(id, reason),
    onSuccess: () => {
      invalidate();
      setCancelOpen(false);
      toast.success("Bron bekor qilindi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const review = useMutation({
    mutationFn: () => reviewsApi.create({ booking: id, rating, comment: comment.trim() }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setComment("");
      toast.success("Sharhingiz uchun rahmat!");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openChat = useMutation({
    mutationFn: () =>
      chatApi.start({ stadium_id: booking.data?.stadium.id as string, booking_id: id }),
    onSuccess: (conversation) => navigate(`/chat/${conversation.id}`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (booking.isLoading) return <PageLoader className="py-24" />;
  if (booking.isError || !booking.data) {
    return (
      <div className="container py-10">
        <ErrorState message="Bron topilmadi." onRetry={() => void booking.refetch()} />
      </div>
    );
  }

  const data = booking.data;

  return (
    <div className="container max-w-3xl space-y-6 py-6">
      <button
        type="button"
        onClick={() => navigate("/bookings")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Bronlarim
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.stadium.name}</h1>
          <p className="text-sm text-muted-foreground">Bron raqami: #{data.reference}</p>
        </div>
        <BookingStatusBadge status={data.status} />
      </div>

      {data.status === "REJECTED" && data.rejection_reason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium text-destructive">Rad etish sababi</p>
            <p className="mt-1">{data.rejection_reason}</p>
          </CardContent>
        </Card>
      )}

      {data.status === "CANCELLED" && data.cancellation_reason && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Bekor qilish sababi</p>
            <p className="mt-1 text-muted-foreground">{data.cancellation_reason}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>O'yin tafsilotlari</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Sana" value={formatDateWithWeekday(data.date)} />
          <Row
            label="Vaqt"
            value={`${formatTime(data.start_time)} — ${formatTime(data.end_time)} (${data.duration_hours} soat)`}
          />
          <Row label="Soatlik narx" value={`${formatMoney(data.hourly_price)} so'm`} />
          <Row
            label="Jami"
            value={`${formatMoney(data.total_price)} so'm`}
            emphasis
          />
          {data.players_count ? (
            <Row label="O'yinchilar" value={`${data.players_count} kishi`} />
          ) : null}
          {data.customer_note && <Row label="Izoh" value={data.customer_note} />}
          <Row label="Yaratilgan" value={formatDateTime(data.created_at)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stadion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            {[data.stadium.district, data.stadium.city, data.stadium.address]
              .filter(Boolean)
              .join(", ")}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/stadiums/${data.stadium.id}`}>Stadion sahifasi</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://yandex.uz/maps/?pt=${data.stadium.longitude},${data.stadium.latitude}&z=17&l=map`}
                target="_blank"
                rel="noreferrer"
              >
                Yo'nalish
              </a>
            </Button>
            {data.stadium.phone && (
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${data.stadium.phone}`}>
                  <Phone className="h-4 w-4" />
                  {formatPhone(data.stadium.phone)}
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              loading={openChat.isPending}
              onClick={() =>
                data.conversation_id
                  ? navigate(`/chat/${data.conversation_id}`)
                  : openChat.mutate()
              }
            >
              <MessageSquare className="h-4 w-4" />
              Egasi bilan yozishish
            </Button>
          </div>
        </CardContent>
      </Card>

      {data.can_review && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Star className="mr-2 inline h-4 w-4" />
              Sharh qoldiring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RatingInput value={rating} onChange={setRating} disabled={review.isPending} />
            <Textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Maydon sifati, yoritish, yechinish xonasi haqida yozing"
            />
            <Button loading={review.isPending} onClick={() => review.mutate()}>
              Yuborish
            </Button>
          </CardContent>
        </Card>
      )}

      {data.status_history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Holat tarixi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.status_history.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {entry.from_status ? `${entry.from_status} → ` : ""}
                    {entry.to_status}
                  </p>
                  {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                    {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.can_cancel && (
        <Button
          variant="destructive"
          className="w-full rounded-full"
          onClick={() => setCancelOpen(true)}
        >
          Bronni bekor qilish
        </Button>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Bronni bekor qilasizmi?"
        description="Bekor qilingan bronni qayta tiklab bo'lmaydi. Vaqt boshqalarga ochiladi."
        confirmLabel="Bekor qilish"
        destructive
        loading={cancel.isPending}
        reason={{ label: "Sabab", placeholder: "Rejalar o'zgardi", required: true }}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/80 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? "font-bold text-primary" : "text-right font-medium"}>
        {value}
      </span>
    </div>
  );
}
