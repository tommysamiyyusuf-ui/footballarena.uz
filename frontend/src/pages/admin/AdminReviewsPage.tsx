import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Star } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { adminApi } from "@/api/panels";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { Rating } from "@/components/shared/Rating";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toApiError } from "@/lib/api";
import { formatDate, initials } from "@/lib/format";
import type { Review } from "@/types/api";

const PAGE_SIZE = 50;
const ALL = "all";
const ANY = "any";

const TABS = [
  { value: "", label: "Barchasi" },
  { value: "true", label: "Ko'rinadigan" },
  { value: "false", label: "Yashirilgan" },
];

const RATINGS = ["5", "4", "3", "2", "1"];

export function AdminReviewsPage() {
  const [params, setParams] = useSearchParams();
  const visible = params.get("visible") ?? "";
  const rating = params.get("rating") ?? "";
  const page = Number(params.get("page") ?? 1);
  const queryClient = useQueryClient();

  const [hiding, setHiding] = useState<Review | null>(null);

  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!changes.page) next.delete("page");
    setParams(next);
  };

  const query = { visible: visible || undefined, rating: rating || undefined, page };
  const reviews = useQuery({
    queryKey: ["admin", "reviews", query],
    queryFn: () => adminApi.reviews(query),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
    queryClient.invalidateQueries({ queryKey: ["reviews"] });
  };

  const hide = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.hideReview(id, reason),
    onSuccess: () => {
      invalidate();
      setHiding(null);
      toast.success("Sharh yashirildi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const restore = useMutation({
    mutationFn: (id: string) => adminApi.restoreReview(id),
    onSuccess: () => {
      invalidate();
      toast.success("Sharh tiklandi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const results = reviews.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sharhlar</h1>
        <p className="text-sm text-muted-foreground">
          Yashirilgan sharh reyting hisobiga kirmaydi va mijozlarga ko'rinmaydi.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs
          className="flex-1"
          value={visible || ALL}
          onValueChange={(value) => patch({ visible: value === ALL ? "" : value })}
        >
          <TabsList className="grid w-full grid-cols-3">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value || ALL} value={tab.value || ALL}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select
          value={rating || ANY}
          onValueChange={(value) => patch({ rating: value === ANY ? "" : value })}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Baho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Barcha baholar</SelectItem>
            {RATINGS.map((value) => (
              <SelectItem key={value} value={value}>
                {value} yulduz
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reviews.isError ? (
        <ErrorState message="Sharhlarni yuklab bo'lmadi." onRetry={() => void reviews.refetch()} />
      ) : reviews.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState icon={Star} title="Sharh topilmadi" description="Filtrlarni o'zgartiring." />
      ) : (
        <div className="space-y-3">
          {results.map((review) => (
            <div key={review.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {review.user_avatar && <AvatarImage src={review.user_avatar} alt="" />}
                    <AvatarFallback>{initials(review.user_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{review.user_name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Link to={`/stadiums/${review.stadium}`} className="hover:underline">
                        {review.stadium_name}
                      </Link>{" "}
                      · #{review.booking_reference} · {formatDate(review.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Rating value={review.rating} />
                  {!review.is_visible && <Badge variant="destructive">Yashirilgan</Badge>}
                </div>
              </div>

              {review.comment && <p className="text-sm">{review.comment}</p>}

              {review.owner_reply && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">Arendator javobi</p>
                  <p>{review.owner_reply}</p>
                </div>
              )}

              <div className="flex justify-end border-t pt-3">
                {review.is_visible ? (
                  <Button size="sm" variant="outline" onClick={() => setHiding(review)}>
                    <EyeOff className="h-4 w-4" />
                    Yashirish
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={restore.isPending && restore.variables === review.id}
                    onClick={() => restore.mutate(review.id)}
                  >
                    <Eye className="h-4 w-4" />
                    Tiklash
                  </Button>
                )}
              </div>
            </div>
          ))}

          <Pagination
            page={page}
            count={reviews.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </div>
      )}

      {hiding && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setHiding(null)}
          title="Sharhni yashirasizmi?"
          description="Sharh stadion sahifasidan olib tashlanadi va reytingdan chiqariladi."
          confirmLabel="Yashirish"
          destructive
          loading={hide.isPending}
          reason={{ label: "Yashirish sababi", required: true }}
          onConfirm={(reason) => hide.mutate({ id: hiding.id, reason })}
        />
      )}
    </div>
  );
}
