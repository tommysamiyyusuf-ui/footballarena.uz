import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { adminApi } from "@/api/panels";
import {
  BookingsChart,
  CategoryChart,
  GrowthChart,
  RevenueChart,
} from "@/components/charts/Charts";
import { Rating } from "@/components/shared/Rating";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
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

const RANGES = [
  { value: "7", label: "7 kun" },
  { value: "30", label: "30 kun" },
  { value: "90", label: "90 kun" },
  { value: "365", label: "1 yil" },
];

function numericDaily(points: DailyPoint[]) {
  return points.map((point) => ({ ...point, revenue: Number(point.revenue) }));
}

function numericMonthly(points: MonthlyPoint[]) {
  return points.map((point) => ({ ...point, revenue: Number(point.revenue) }));
}

export function AdminStatisticsPage() {
  const [params, setParams] = useSearchParams();
  const days = params.get("days") ?? "30";

  const statistics = useQuery({
    queryKey: ["admin", "statistics", days],
    queryFn: () => adminApi.statistics(Number(days)),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Statistika</h1>
          <p className="text-sm text-muted-foreground">
            Platforma o'sishi va tushum dinamikasi.
          </p>
        </div>
        <Select
          value={days}
          onValueChange={(value) => {
            const next = new URLSearchParams(params);
            next.set("days", value);
            setParams(next);
          }}
        >
          <SelectTrigger className="w-36">
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(["today", "week", "month", "year", "total"] as const).map((window) => (
          <StatCard
            key={window}
            label={
              { today: "Bugun", week: "Hafta", month: "Oy", year: "Yil", total: "Jami" }[window]
            }
            value={formatCompactSum(data.revenue[window].gross)}
            hint={`${data.revenue[window].bookings} bron · komissiya ${formatCompactSum(
              data.revenue[window].commission,
            )}`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kunlik tushum</CardTitle>
        </CardHeader>
        <CardContent>
          {data.daily.length === 0 ? (
            <EmptyState title="Ma'lumot yo'q" />
          ) : (
            <RevenueChart data={numericDaily(data.daily)} xKey="date" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>O'sish dinamikasi</CardTitle>
        </CardHeader>
        <CardContent>
          <GrowthChart
            series={[
              {
                name: "Foydalanuvchilar",
                color: "hsl(var(--primary))",
                data: data.user_growth,
              },
              {
                name: "Stadionlar",
                color: "hsl(var(--success))",
                data: data.stadium_growth,
              },
              {
                name: "Bronlar",
                color: "hsl(var(--warning))",
                data: data.booking_growth,
              },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Oylik bronlar</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthly.length === 0 ? (
              <EmptyState title="Ma'lumot yo'q" />
            ) : (
              <BookingsChart data={numericMonthly(data.monthly)} xKey="month" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ommabop soatlar</CardTitle>
          </CardHeader>
          <CardContent>
            {data.popular_hours.length === 0 ? (
              <EmptyState title="Ma'lumot yo'q" />
            ) : (
              <CategoryChart data={data.popular_hours} xKey="hour" label="Bronlar" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eng samarali stadionlar</CardTitle>
        </CardHeader>
        <CardContent>
          {data.stadium_performance.length === 0 ? (
            <EmptyState title="Ma'lumot yo'q" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stadion</TableHead>
                    <TableHead className="text-right">Bronlar</TableHead>
                    <TableHead className="text-right">Tushum</TableHead>
                    <TableHead className="text-right">Reyting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stadium_performance.map((row) => (
                    <TableRow key={row.stadium_id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.bookings}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(row.revenue)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Rating value={row.rating} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
