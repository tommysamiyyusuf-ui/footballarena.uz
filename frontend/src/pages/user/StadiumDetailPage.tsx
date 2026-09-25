import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  MessageSquare,
  Phone,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { chatApi, reviewsApi } from "@/api/misc";
import { stadiumsApi } from "@/api/stadiums";
import { StadiumMap } from "@/components/map/StadiumMap";
import { Rating } from "@/components/shared/Rating";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFavoriteToggle } from "@/hooks/useFavorite";
import { errorMessage } from "@/lib/api";
import { FIELD_TYPE_LABEL, WEEKDAYS } from "@/lib/constants";
import { formatDate, formatMoney, formatPhone, formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

export function StadiumDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { toggle, isPending: favoritePending } = useFavoriteToggle();

  const stadium = useQuery({
    queryKey: ["stadium", id],
    queryFn: () => stadiumsApi.detail(id),
    enabled: Boolean(id),
  });

  const reviews = useQuery({
    queryKey: ["reviews", { stadium: id }],
    queryFn: () => reviewsApi.list({ stadium: id }),
    enabled: Boolean(id),
  });

  const startChat = useMutation({
    mutationFn: () => chatApi.start({ stadium_id: id }),
    onSuccess: (conversation) => navigate(`/chat/${conversation.id}`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (stadium.isLoading) return <PageLoader className="py-24" />;
  if (stadium.isError || !stadium.data) {
    return (
      <div className="container py-10">
        <ErrorState
          message="Stadion ma'lumotlarini yuklab bo'lmadi."
          onRetry={() => void stadium.refetch()}
        />
      </div>
    );
  }

  const data = stadium.data;
  const canBook = !user || user.role === "USER";

  return (
    <div className="container space-y-6 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Orqaga
      </button>

      <Gallery images={data.images} name={data.name} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold sm:text-3xl">{data.name}</h1>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {[data.district, data.city, data.address].filter(Boolean).join(", ")}
                </p>
              </div>
              {user?.role === "USER" && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Sevimlilarga qo'shish"
                  disabled={favoritePending}
                  onClick={() => toggle(data.id)}
                >
                  <Heart
                    className={cn(
                      "h-4 w-4",
                      data.is_favorite ? "fill-destructive text-destructive" : "",
                    )}
                  />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Rating value={data.rating} count={data.review_count} size="md" />
              <Badge variant="secondary">
                {FIELD_TYPE_LABEL[data.field_type] ?? data.field_type_display}
              </Badge>
              {data.capacity ? (
                <Badge variant="secondary">
                  <Users className="mr-1 h-3 w-3" />
                  {data.capacity} kishi
                </Badge>
              ) : null}
              <Badge variant="secondary">{data.booking_count} marta bron qilingan</Badge>
            </div>
          </div>

          {data.description && (
            <Card>
              <CardHeader>
                <CardTitle>Stadion haqida</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm text-muted-foreground">
                {data.description}
              </CardContent>
            </Card>
          )}

          {data.amenities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Qulayliklar</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.amenities.map((amenity) => (
                  <Badge key={amenity.id} variant="outline">
                    {amenity.name_uz || amenity.name}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Ish vaqti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {WEEKDAYS.map((day) => {
                const hours = data.working_hours.find((item) => item.weekday === day.value);
                const closed = !hours || hours.is_closed || !hours.open_time;
                return (
                  <div
                    key={day.value}
                    className="flex items-center justify-between border-b border-border/80 py-1.5 last:border-0"
                  >
                    <span>{day.label}</span>
                    <span className={closed ? "text-muted-foreground" : "font-medium"}>
                      {closed
                        ? "Yopiq"
                        : `${formatTime(hours.open_time)} — ${formatTime(hours.close_time)}`}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Xaritada</CardTitle>
            </CardHeader>
            <CardContent>
              <StadiumMap
                stadiums={[data]}
                center={{ lat: data.latitude, lng: data.longitude }}
                zoom={16}
                className="h-72 w-full overflow-hidden rounded-xl border border-border/80"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sharhlar ({data.review_count})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviews.isLoading ? (
                <PageLoader className="py-8" />
              ) : !reviews.data?.results.length ? (
                <EmptyState
                  title="Hozircha sharh yo'q"
                  description="Bron yakunlangandan so'ng birinchi bo'lib sharh qoldiring."
                />
              ) : (
                reviews.data.results.map((review) => (
                  <div
                    key={review.id}
                    className="space-y-2 border-b border-border/80 pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {review.user_avatar && <AvatarImage src={review.user_avatar} alt="" />}
                        <AvatarFallback>{initials(review.user_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{review.user_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(review.created_at)}
                        </p>
                      </div>
                      <Rating value={review.rating} />
                    </div>
                    {review.comment && <p className="text-sm">{review.comment}</p>}
                    {review.owner_reply && (
                      <div className="rounded-xl bg-muted p-3 text-sm">
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">
                          Stadion egasi javobi
                        </p>
                        {review.owner_reply}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <Card className="rounded-2xl shadow-lg shadow-primary/5">
            <CardContent className="space-y-4 pt-6">
              <div>
                <p className="text-2xl font-bold text-primary">
                  {formatMoney(data.price_per_hour)}{" "}
                  <span className="text-sm font-medium text-muted-foreground">so'm / soat</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Yakuniy narx soatlar soniga qarab hisoblanadi.
                </p>
              </div>

              {canBook ? (
                <Button asChild className="w-full rounded-full" size="lg">
                  <Link to={user ? `/stadiums/${data.id}/book` : "/login"}>
                    <CalendarPlus className="h-4 w-4" />
                    Bron qilish
                  </Link>
                </Button>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  Bron qilish faqat mijoz hisobida mavjud.
                </p>
              )}

              {user?.role === "USER" && (
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  loading={startChat.isPending}
                  onClick={() => startChat.mutate()}
                >
                  <MessageSquare className="h-4 w-4" />
                  Egasi bilan bog'lanish
                </Button>
              )}

              {data.phone && (
                <a
                  href={`tel:${data.phone}`}
                  className="flex items-center justify-center gap-2 rounded-full border border-border/80 py-2.5 text-sm font-medium hover:bg-accent"
                >
                  <Phone className="h-4 w-4" />
                  {formatPhone(data.phone)}
                </a>
              )}

              {data.owner && (
                <div className="border-t border-border/80 pt-4 text-sm">
                  <p className="text-xs text-muted-foreground">Stadion egasi</p>
                  <p className="font-medium">{data.owner.company_name || data.owner.name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Gallery({
  images,
  name,
}: {
  images: { id: string; image: string; caption: string }[];
  name: string;
}) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/7] items-center justify-center rounded-2xl border border-border/80 bg-muted text-sm text-muted-foreground">
        Rasm yo'q
      </div>
    );
  }

  const step = (delta: number) =>
    setIndex((current) => (current + delta + images.length) % images.length);

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-muted sm:aspect-[16/7]">
        <img
          src={images[index].image}
          alt={images[index].caption || name}
          className="h-full w-full object-cover"
        />
        {images.length > 1 && (
          <>
            <GalleryArrow side="left" onClick={() => step(-1)} />
            <GalleryArrow side="right" onClick={() => step(1)} />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, position) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(position)}
              className={cn(
                "h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-colors",
                position === index ? "border-primary" : "border-transparent opacity-70",
              )}
            >
              <img src={image.image} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Oldingi rasm" : "Keyingi rasm"}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
