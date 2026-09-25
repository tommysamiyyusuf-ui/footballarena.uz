import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ownerApi } from "@/api/panels";
import { stadiumsApi } from "@/api/stadiums";
import { BookingsChart, CategoryChart, RevenueChart } from "@/components/charts/Charts";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCompactSum, formatMoney } from "@/lib/format";
import type { DailyPoint, MonthlyPoint } from "@/types/api";

const ALL = "all";
const RANGES = [
  { value: "7", label: "7 kun" },
  { value: "30", label: "30 kun" },
  { value: "90", label: "90 kun" },
  { value: "365", label: "1 yil" },
];

/** Charts need numbers; the API sends decimals as strings. */
function numeric<T extends DailyPoint | MonthlyPoint>(points: T[]) {
  return points.map((point) => ({ ...point, revenue: Number(point.revenue) }));
}

export function OwnerStatisticsPage() {
  const [days, setDays] = useState("30");
  const [stadium, setStadium] = useState("");

  const myStadiums = useQuery({
    queryKey: ["stadiums", { mine: true, page_size: 100 }],
    queryFn: () => stadiumsApi.list({ mine: true, page_size: 100 }),
  });

  const statistics = useQuery({
    queryKey: ["owner", "statistics", days, stadium],
    queryFn: () =>
      ownerApi.statistics({ days: Number(days), ...(stadium ? { stadium } : {}) }),
    placeholderData: (previous) => previous,
  });

  if (statistics.isLoading) return <PageLoader className="py-24" />;
  if (statistics.isError || !statistics.data) {
    return (
      <ErrorState
        message="Statistikani yuklab bo'lmadi."
        onRetry={() => void statistics.refetch()}
      />
    );
  }

  const data = statistics.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Statistika</h1>
          <p className="text-sm text-muted-foreground">
            Tushum va bronlar dinamikasi. Ko'rsatilgan summa komissiya ayirilgandan keyingi
            sof daromad.
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stadium || ALL} onValueChange={(value) => setStadium(value === ALL ? "" : value)}>
            <SelectTrigger className="w-56">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Bugun" value={formatCompactSum(data.revenue.today.net)} hint={`${data.revenue.today.bookings} bron`} />
        <StatCard label="Hafta" value={formatCompactSum(data.revenue.week.net)} hint={`${data.revenue.week.bookings} bron`} />
        <StatCard label="Oy" value={formatCompactSum(data.revenue.month.net)} hint={`${data.revenue.month.bookings} bron`} />
        <StatCard label="Yil" value={formatCompactSum(data.revenue.year.net)} hint={`${data.revenue.year.bookings} bron`} />
        <StatCard
          label="Umumiy"
          value={formatCompactSum(data.revenue.total.net)}
          hint={`${data.revenue.total.bookings} bron`}
          tone="success"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Jami" value={data.counters.total} />
        <StatCard label="Kutilmoqda" value={data.counters.pending} tone="warning" />
        <StatCard label="Tasdiqlangan" value={data.counters.approved} tone="success" />
        <StatCard label="Yakunlangan" value={data.counters.completed} />
        <StatCard label="Bekor qilingan" value={data.counters.cancelled} />
        <StatCard label="Rad etilgan" value={data.counters.rejected} tone="destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kunlik tushum</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart data={numeric(data.daily)} xKey="date" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Oylik bronlar</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingsChart data={numeric(data.monthly)} xKey="month" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eng band soatlar</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryChart data={data.popular_hours} xKey="hour" label="Bronlar" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hafta kunlari</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryChart data={data.weekdays} xKey="weekday" label="Bronlar" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stadionlar kesimida</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stadion</TableHead>
                <TableHead className="text-right">Bronlar</TableHead>
                <TableHead className="text-right">Reyting</TableHead>
                <TableHead className="text-right">Tushum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stadium_performance.map((row) => (
                <TableRow key={row.stadium_id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.bookings}</TableCell>
                  <TableCell className="text-right">{row.rating.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatMoney(row.revenue)} so'm
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
