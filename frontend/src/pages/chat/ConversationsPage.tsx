import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { chatApi } from "@/api/misc";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatRelative, initials } from "@/lib/format";

const PAGE_SIZE = 20;

export function ConversationsPage({ basePath }: { basePath: string }) {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);

  const conversations = useQuery({
    queryKey: ["conversations", page],
    queryFn: () => chatApi.conversations(page),
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
  });

  const results = conversations.data?.results ?? [];

  return (
    <div className="container max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Xabarlar</h1>
        <p className="text-sm text-muted-foreground">Stadion bo'yicha yozishmalar.</p>
      </div>

      {conversations.isError ? (
        <ErrorState
          message="Suhbatlarni yuklab bo'lmadi."
          onRetry={() => void conversations.refetch()}
        />
      ) : conversations.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Suhbatlar yo'q"
          description="Stadion sahifasidan egasi bilan bog'lanishingiz mumkin."
        />
      ) : (
        <div className="divide-y divide-border/80 rounded-2xl border border-border/80 bg-card">
          {results.map((conversation) => (
            <Link
              key={conversation.id}
              to={`${basePath}/${conversation.id}`}
              className="flex items-center gap-3 p-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent"
            >
              <Avatar className="h-11 w-11">
                {conversation.participant?.avatar && (
                  <AvatarImage src={conversation.participant.avatar} alt="" />
                )}
                <AvatarFallback>
                  {initials(conversation.participant?.name ?? conversation.stadium_name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium">
                    {conversation.participant?.name ?? "Suhbatdosh"}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {conversation.last_message_at
                      ? formatRelative(conversation.last_message_at)
                      : ""}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {conversation.stadium_name}
                  {conversation.booking_reference ? ` · #${conversation.booking_reference}` : ""}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {conversation.last_message_preview || "Xabar yo'q"}
                </p>
              </div>

              {conversation.unread_count > 0 && (
                <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                  {conversation.unread_count}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        count={conversations.data?.count ?? 0}
        pageSize={PAGE_SIZE}
        onChange={(next) => setParams({ page: String(next) })}
      />
    </div>
  );
}
