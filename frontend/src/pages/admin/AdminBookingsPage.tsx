import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { adminApi } from "@/api/panels";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { BookingStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";

const PAGE_SIZE = 50;
const ALL = "all";

const TABS = [
  { value: "", label: "Barchasi" },
  { value: "PENDING", label: "Kutilmoqda" },
  { value: "APPROVED", label: "Tasdiqlangan" },
  { value: "COMPLETED", label: "Yakunlangan" },
  { value: "CANCELLED", label: "Bekor" },
  { value: "REJECTED", label: "Rad etilgan" },
];

export function AdminBookingsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const dateFrom = params.get("date_from") ?? "";
  const dateTo = params.get("date_to") ?? "";
  const page = Number(params.get("page") ?? 1);

  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const search = useDebounce(searchInput, 400);

  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!changes.page) next.delete("page");
    setParams(next);
  };

  const query = {
    status: status || undefined,
    search: search || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
  };

  const bookings = useQuery({
    queryKey: ["admin", "bookings", query],
    queryFn: () => adminApi.bookings(query),
    placeholderData: (previous) => previous,
  });

  const results = bookings.data?.results ?? [];
  const hasFilters = Boolean(status || search || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bronlar</h1>
        <p className="text-sm text-muted-foreground">
          Platformadagi barcha bronlar. Tasdiqlashni arendator amalga oshiradi.
        </p>
      </div>

      <Tabs
        value={status || ALL}
        onValueChange={(value) => patch({ status: value === ALL ? "" : value })}
      >
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value || ALL} value={tab.value || ALL}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              patch({ search: event.target.value });
            }}
            placeholder="Raqam, mijoz yoki stadion"
            className="pl-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="date-from" className="text-xs text-muted-foreground">
            Dan
          </Label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(event) => patch({ date_from: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="date-to" className="text-xs text-muted-foreground">
            Gacha
          </Label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(event) => patch({ date_to: event.target.value })}
          />
        </div>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearchInput("");
            setParams(new URLSearchParams());
          }}
        >
          Filtrlarni tozalash
        </Button>
      )}

      {bookings.isError ? (
        <ErrorState message="Bronlarni yuklab bo'lmadi." onRetry={() => void bookings.refetch()} />
      ) : bookings.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Bron topilmadi"
          description="Filtrlarni o'zgartiring."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bron</TableHead>
                  <TableHead>Stadion / Arendator</TableHead>
                  <TableHead>Mijoz</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead className="text-right">Komissiya</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>
                      <p className="font-medium">#{booking.reference}</p>
                      <p className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(booking.date)} · {booking.start_time.slice(0, 5)}–
                        {booking.end_time.slice(0, 5)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/stadiums/${booking.stadium_id}`}
                        className="font-medium hover:underline"
                      >
                        {booking.stadium_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{booking.owner_name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{booking.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatPhone(booking.customer_phone)}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatMoney(booking.total_price)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-success">
                      {formatMoney(booking.commission_amount)}
                    </TableCell>
                    <TableCell>
                      <BookingStatusBadge status={booking.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            count={bookings.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </>
      )}
    </div>
  );
}
