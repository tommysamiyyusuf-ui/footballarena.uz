import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  MapPin,
  Star,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { adminApi } from "@/api/panels";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactSum, formatDate, formatMoney } from "@/lib/format";

export function AdminDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: adminApi.dashboard,
    refetchInterval: 15_000,
  });

  if (dashboard.isLoading) return <PageLoader className="py-24" />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <ErrorState
        message="Boshqaruv panelini yuklab bo'lmadi."
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const data = dashboard.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Boshqaruv paneli</h1>
        <p className="text-sm text-muted-foreground">Platforma bo'yicha umumiy ko'rsatkichlar.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Platforma komissiyasi"
          value={formatCompactSum(data.revenue.platform_commission)}
          hint={`Bugun: ${formatMoney(data.revenue.today)} so'm`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Umumiy aylanma"
          value={formatCompactSum(data.revenue.gross)}
          hint={`Arendatorlarga: ${formatCompactSum(data.revenue.owner_net)}`}
          icon={Wallet}
        />
        <StatCard
          label="Moderatsiya navbati"
          value={data.stadiums.pending}
          hint="Tasdiqlash kutilmoqda"
          icon={ClipboardList}
          tone={data.stadiums.pending > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Kutilayotgan bronlar"
          value={data.bookings.pending}
          hint={`Bugun: ${data.bookings.today}`}
          icon={CalendarClock}
        />
        <StatCard
          label="Foydalanuvchilar"
          value={data.users.total}
          hint={`Bugun +${data.users.new_today} · ${data.users.blocked} bloklangan`}
          icon={Users}
        />
        <StatCard
          label="Arendatorlar"
          value={data.owners.total}
          hint={`${data.owners.blocked} bloklangan`}
          icon={UserCog}
        />
        <StatCard
          label="Stadionlar"
          value={data.stadiums.approved}
          hint={`${data.stadiums.rejected} rad · ${data.stadiums.blocked} bloklangan`}
          icon={MapPin}
        />
        <StatCard
          label="Bronlar"
          value={data.bookings.total}
          hint={`${data.bookings.completed} yakunlangan`}
          icon={CalendarDays}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Sharhlar"
          value={data.reviews.total}
          hint={`${data.reviews.hidden} yashirilgan`}
          icon={Star}
        />
        <StatCard
          label="Bekor qilingan bronlar"
          value={data.bookings.cancelled}
          hint={`${data.bookings.rejected} rad etilgan`}
          icon={CalendarDays}
          tone="destructive"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Moderatsiya navbati</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/moderation">Barchasi</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.pending_stadiums.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Navbat bo'sh"
              description="Barcha stadionlar ko'rib chiqilgan."
            />
          ) : (
            data.pending_stadiums.map((stadium) => (
              <Link
                key={stadium.id}
                to="/admin/moderation"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  {stadium.cover_image && (
                    <img src={stadium.cover_image} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{stadium.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {stadium.city} · {stadium.owner?.name ?? "—"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(stadium.created_at)}
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
