import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import { notificationsApi } from "@/api/misc";
import { cn } from "@/lib/utils";

export function NotificationBell({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 20_000,
  });

  const count = data?.count ?? 0;

  return (
    <Link
      to="/notifications"
      aria-label="Bildirishnomalar"
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-accent",
        className,
      )}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
