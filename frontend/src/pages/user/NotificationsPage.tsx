import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { notificationsApi } from "@/api/misc";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/api";

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const notifications = useQuery({
    queryKey: ["notifications", page],
    queryFn: () => notificationsApi.list(page),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      invalidate();
      toast.success("Barchasi o'qilgan deb belgilandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const clear = useMutation({
    mutationFn: notificationsApi.clear,
    onSuccess: () => {
      invalidate();
      toast.success("Bildirishnomalar tozalandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const open = (notification: AppNotification) => {
    if (!notification.is_read) markRead.mutate(notification.id);
    const route = notification.payload?.route;
    if (typeof route === "string" && route.startsWith("/")) navigate(route);
  };

  const results = notifications.data?.results ?? [];

  return (
    <div className="container max-w-3xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bildirishnomalar</h1>
          <p className="text-sm text-muted-foreground">Bronlar va tizim xabarlari.</p>
        </div>
        {results.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              O'qilgan
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              loading={clear.isPending}
              onClick={() => clear.mutate()}
            >
              <Trash2 className="h-4 w-4" />
              Tozalash
            </Button>
          </div>
        )}
      </div>

      {notifications.isError ? (
        <ErrorState
          message="Bildirishnomalarni yuklab bo'lmadi."
          onRetry={() => void notifications.refetch()}
        />
      ) : notifications.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Bildirishnoma yo'q"
          description="Bron holati o'zgarganda bu yerda xabar paydo bo'ladi."
        />
      ) : (
        <div className="space-y-2">
          {results.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => open(notification)}
              className={cn(
                "flex w-full gap-3 rounded-xl border border-border/80 p-4 text-left transition-colors hover:bg-accent",
                !notification.is_read && "border-primary/30 bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  notification.is_read ? "bg-transparent" : "bg-primary",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{notification.title}</p>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelative(notification.created_at)}
                </p>
              </div>
            </button>
          ))}
          <Pagination
            page={page}
            count={notifications.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => setParams({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
