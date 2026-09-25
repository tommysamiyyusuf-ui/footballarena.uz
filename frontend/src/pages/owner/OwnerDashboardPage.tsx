import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarClock,
  MapPin,
  Percent,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ownerApi } from "@/api/panels";
import { BookingCard } from "@/components/shared/BookingCard";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { OwnerBookingActions } from "@/components/owner/OwnerBookingActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactSum } from "@/lib/format";

export function OwnerDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["owner", "dashboard"],
    queryFn: ownerApi.dashboard,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Boshqaruv paneli</h1>
          <p className="text-sm text-muted-foreground">
            Stadionlaringiz bo'yicha umumiy holat.
          </p>
        </div>
        <Button asChild>
          <Link to="/owner/stadiums/new">Stadion qo'shish</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Bugungi tushum"
          value={formatCompactSum(data.revenue.today.net)}
          hint={`${data.revenue.today.bookings} ta bron`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Oylik tushum"
          value={formatCompactSum(data.revenue.month.net)}
          hint={`${data.revenue.month.bookings} ta bron`}
          icon={TrendingUp}
        />
        <StatCard
          label="Kutilayotgan so'rovlar"
          value={data.bookings.pending}
          hint="Javob berish kerak"
          icon={CalendarClock}
          tone={data.bookings.pending > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Bugungi o'yinlar"
          value={data.today_bookings}
          hint={`${data.bookings.upcoming} ta kelayotgan`}
          icon={CalendarCheck}
        />
        <StatCard
          label="Stadionlar"
          value={data.stadiums.approved}
          hint={`${data.stadiums.pending} ta moderatsiyada`}
          icon={MapPin}
        />
        <StatCard
          label="Reyting"
          value={data.rating.average.toFixed(1)}
          hint={`${data.rating.reviews} ta sharh`}
          icon={Star}
        />
        <StatCard
          label="Bandlik"
          value={`${Math.round(data.occupancy_rate)}%`}
          hint="So'nggi 30 kun"
          icon={Percent}
        />
        <StatCard
          label="Umumiy tushum"
          value={formatCompactSum(data.revenue.total.net)}
          hint={`${data.bookings.completed} ta yakunlangan`}
          icon={Wallet}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Yangi so'rovlar</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/owner/bookings?tab=pending">Barchasi</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.pending_requests.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Yangi so'rov yo'q"
              description="Barcha so'rovlar ko'rib chiqilgan."
            />
          ) : (
            data.pending_requests.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                actions={<OwnerBookingActions booking={booking} />}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Kelayotgan o'yinlar</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/owner/calendar">Kalendar</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.upcoming_bookings.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="Rejalashtirilgan o'yin yo'q"
              description="Tasdiqlangan bronlar shu yerda ko'rinadi."
            />
          ) : (
            data.upcoming_bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
