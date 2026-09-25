import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { bookingsApi, type BookingQuery } from "@/api/bookings";
import { stadiumsApi } from "@/api/stadiums";
import { BookingCard } from "@/components/shared/BookingCard";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { OwnerBookingActions } from "@/components/owner/OwnerBookingActions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/useDebounce";

const PAGE_SIZE = 10;
const ALL = "all";

const TABS = [
  { value: "pending", label: "Yangi" },
  { value: "upcoming", label: "Kelayotgan" },
  { value: "past", label: "O'tgan" },
  { value: "all", label: "Barchasi" },
];

function toQuery(tab: string, page: number, stadium: string, search: string): BookingQuery {
  const base: BookingQuery = { page };
  if (stadium) base.stadium = stadium;
  if (search) base.search = search;
  if (tab === "pending") return { ...base, status: "PENDING" };
  if (tab === "upcoming") return { ...base, scope: "upcoming", status: "APPROVED" };
  if (tab === "past") return { ...base, scope: "past" };
  return base;
}

export function OwnerBookingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "pending";
  const page = Number(params.get("page") ?? 1);
  const stadium = params.get("stadium") ?? "";

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

  const myStadiums = useQuery({
    queryKey: ["stadiums", { mine: true, page_size: 100 }],
    queryFn: () => stadiumsApi.list({ mine: true, page_size: 100 }),
  });

  const query = toQuery(tab, page, stadium, search);
  const bookings = useQuery({
    queryKey: ["bookings", "owner", query],
    queryFn: () => bookingsApi.list(query),
    placeholderData: (previous) => previous,
    refetchInterval: 15_000,
  });

  const results = bookings.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bronlar</h1>
        <p className="text-sm text-muted-foreground">
          So'rovlarni tasdiqlang yoki sabab ko'rsatib rad eting.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => patch({ tab: value })}>
        <TabsList className="grid w-full grid-cols-4">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              patch({ search: event.target.value });
            }}
            placeholder="Mijoz ismi, telefon yoki bron raqami"
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={stadium || ALL}
            onValueChange={(value) => patch({ stadium: value === ALL ? "" : value })}
          >
            <SelectTrigger>
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

      {bookings.isError ? (
        <ErrorState message="Bronlarni yuklab bo'lmadi." onRetry={() => void bookings.refetch()} />
      ) : bookings.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Bron topilmadi"
          description="Tanlangan filtrlar bo'yicha natija yo'q."
        />
      ) : (
        <div className="space-y-3">
          {results.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              actions={<OwnerBookingActions booking={booking} />}
            />
          ))}
          <Pagination
            page={page}
            count={bookings.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
