import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { bookingsApi, type BookingQuery } from "@/api/bookings";
import { BookingCard } from "@/components/shared/BookingCard";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE_SIZE = 10;

const TABS = [
  { value: "upcoming", label: "Kelayotgan" },
  { value: "pending", label: "Kutilmoqda" },
  { value: "past", label: "O'tgan" },
  { value: "all", label: "Barchasi" },
];

function toQuery(tab: string, page: number): BookingQuery {
  const base: BookingQuery = { page };
  if (tab === "upcoming") return { ...base, scope: "upcoming", status: "PENDING,APPROVED" };
  if (tab === "pending") return { ...base, status: "PENDING" };
  if (tab === "past") return { ...base, scope: "past" };
  return base;
}

export function MyBookingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "upcoming";
  const page = Number(params.get("page") ?? 1);

  const query = toQuery(tab, page);
  const bookings = useQuery({
    queryKey: ["bookings", query],
    queryFn: () => bookingsApi.list(query),
    placeholderData: (previous) => previous,
  });

  const results = bookings.data?.results ?? [];

  return (
    <div className="container max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Bronlarim</h1>
        <p className="text-sm text-muted-foreground">
          So'rovlaringiz holati va o'tgan o'yinlaringiz.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setParams({ tab: value })}
      >
        <TabsList className="grid w-full grid-cols-4">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {bookings.isError ? (
        <ErrorState message="Bronlarni yuklab bo'lmadi." onRetry={() => void bookings.refetch()} />
      ) : bookings.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Bron topilmadi"
          description="Stadion tanlab birinchi bronni yarating."
          action={
            <Button asChild>
              <Link to="/">Stadionlarni ko'rish</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {results.map((booking) => (
            <BookingCard key={booking.id} booking={booking} to={`/bookings/${booking.id}`} />
          ))}
          <Pagination
            page={page}
            count={bookings.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => setParams({ tab, page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
