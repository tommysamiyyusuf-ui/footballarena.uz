import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { reviewsApi } from "@/api/misc";
import { stadiumsApi } from "@/api/stadiums";
import { Pagination } from "@/components/shared/Pagination";
import { Rating } from "@/components/shared/Rating";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { formatDate, initials } from "@/lib/format";

const PAGE_SIZE = 20;
const ALL = "all";

export function OwnerReviewsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const stadium = params.get("stadium") ?? "";
  const queryClient = useQueryClient();
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const myStadiums = useQuery({
    queryKey: ["stadiums", { mine: true, page_size: 100 }],
    queryFn: () => stadiumsApi.list({ mine: true, page_size: 100 }),
  });

  const reviews = useQuery({
    queryKey: ["reviews", "owner", { stadium, page }],
    queryFn: () => reviewsApi.list({ stadium: stadium || undefined, page }),
    placeholderData: (previous) => previous,
  });

  const reply = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => reviewsApi.reply(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setReplyFor(null);
      setReplyText("");
      toast.success("Javob yuborildi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const results = reviews.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sharhlar</h1>
          <p className="text-sm text-muted-foreground">
            Mijozlar fikriga javob bering — bu reytingga ijobiy ta'sir qiladi.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={stadium || ALL}
            onValueChange={(value) =>
              setParams(value === ALL ? {} : { stadium: value })
            }
          >
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

      {reviews.isError ? (
        <ErrorState message="Sharhlarni yuklab bo'lmadi." onRetry={() => void reviews.refetch()} />
      ) : reviews.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Sharh yo'q"
          description="O'yin yakunlangandan keyin mijozlar sharh qoldirishi mumkin."
        />
      ) : (
        <div className="space-y-3">
          {results.map((review) => (
            <Card key={review.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {review.user_avatar && <AvatarImage src={review.user_avatar} alt="" />}
                    <AvatarFallback>{initials(review.user_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{review.user_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {review.stadium_name} · {formatDate(review.created_at)}
                    </p>
                  </div>
                  <Rating value={review.rating} />
                </div>

                {review.comment && <p className="text-sm">{review.comment}</p>}

                {review.owner_reply ? (
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Sizning javobingiz
                    </p>
                    {review.owner_reply}
                  </div>
                ) : replyFor === review.id ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      autoFocus
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="Fikringiz uchun rahmat…"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={reply.isPending}
                        disabled={!replyText.trim()}
                        onClick={() => reply.mutate({ id: review.id, text: replyText.trim() })}
                      >
                        Yuborish
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReplyFor(null)}>
                        Bekor qilish
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplyFor(review.id);
                      setReplyText("");
                    }}
                  >
                    Javob berish
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          <Pagination
            page={page}
            count={reviews.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) =>
              setParams(stadium ? { stadium, page: String(next) } : { page: String(next) })
            }
          />
        </div>
      )}
    </div>
  );
}
