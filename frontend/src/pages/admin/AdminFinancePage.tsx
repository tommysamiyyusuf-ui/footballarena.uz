import { useQuery } from "@tanstack/react-query";
import { Banknote, PiggyBank, Receipt, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { adminApi } from "@/api/panels";
import { BookingsChart, RevenueChart } from "@/components/charts/Charts";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** Recharts needs numbers; the API sends decimals as strings. */
function numericDaily(points: DailyPoint[]) {
  return points.map((point) => ({ ...point, revenue: Number(point.revenue) }));
}

function numericMonthly(points: MonthlyPoint[]) {
  return points.map((point) => ({ ...point, revenue: Number(point.revenue) }));
}

export function AdminFinancePage() {
  const [params, setParams] = useSearchParams();
  const dateFrom = params.get("date_from") ?? "";
  const dateTo = params.get("date_to") ?? "";

  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  const query = { date_from: dateFrom || undefined, date_to: dateTo || undefined };
  const finance = useQuery({
    queryKey: ["admin", "finance", query],
    queryFn: () => adminApi.finance(query),
    placeholderData: (previous) => previous,
  });

  if (finance.isLoading) return <PageLoader className="py-24" />;
  if (finance.isError || !finance.data) {
    return (
      <ErrorState
        message="Moliya ma'lumotlarini yuklab bo'lmadi."
        onRetry={() => void finance.refetch()}
      />
    );
  }

  const data = finance.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moliya</h1>
        <p className="text-sm text-muted-foreground">
          Yakunlangan bronlar bo'yicha aylanma, platforma komissiyasi va arendator ulushi.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="finance-from" className="text-xs text-muted-foreground">
            Dan
          </Label>
          <Input
            id="finance-from"
            type="date"
            value={dateFrom}
            onChange={(event) => patch({ date_from: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="finance-to" className="text-xs text-muted-foreground">
            Gacha
          </Label>
          <Input
            id="finance-to"
            type="date"
            value={dateTo}
            onChange={(event) => patch({ date_to: event.target.value })}
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
            Tozalash
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Umumiy aylanma"
          value={formatCompactSum(data.totals.gross)}
          hint={`${data.totals.bookings} ta bron`}
          icon={Banknote}
        />
        <StatCard
          label="Platforma komissiyasi"
          value={formatCompactSum(data.totals.commission)}
          hint="Tanlangan davr uchun"
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Arendatorlarga"
          value={formatCompactSum(data.totals.owner_net)}
          hint="To'lanishi kerak bo'lgan ulush"
          icon={PiggyBank}
        />
        <StatCard
          label="Bugungi komissiya"
          value={formatCompactSum(data.revenue.today.commission)}
          hint={`Oy: ${formatCompactSum(data.revenue.month.commission)}`}
          icon={Receipt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["today", "week", "month", "year"] as const).map((window) => (
          <StatCard
            key={window}
            label={
              { today: "Bugun", week: "Hafta", month: "Oy", year: "Yil" }[window]
            }
            value={formatCompactSum(data.revenue[window].gross)}
            hint={`Komissiya: ${formatCompactSum(data.revenue[window].commission)} · ${data.revenue[window].bookings} bron`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kunlik aylanma</CardTitle>
        </CardHeader>
        <CardContent>
          {data.daily.length === 0 ? (
            <EmptyState title="Ma'lumot yo'q" description="Tanlangan davrda tushum bo'lmagan." />
          ) : (
            <RevenueChart data={numericDaily(data.daily)} xKey="date" />
          )}
        </CardContent>
      </Card>

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
          <CardTitle>Arendatorlar kesimida</CardTitle>
        </CardHeader>
        <CardContent>
          {data.by_owner.length === 0 ? (
            <EmptyState title="Ma'lumot yo'q" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arendator</TableHead>
                    <TableHead className="text-right">Bronlar</TableHead>
                    <TableHead className="text-right">Aylanma</TableHead>
                    <TableHead className="text-right">Komissiya</TableHead>
                    <TableHead className="text-right">Sof ulush</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_owner.map((row) => (
                    <TableRow key={row.owner_id}>
                      <TableCell className="font-medium">{row.owner_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.bookings}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(row.gross)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-success">
                        {formatMoney(row.commission)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatMoney(row.net)}
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
