import { useQuery } from "@tanstack/react-query";
import { MapPin, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { adminApi } from "@/api/panels";
import { StadiumModerationCard } from "@/components/admin/StadiumModerationCard";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/useDebounce";

const PAGE_SIZE = 50;

const TABS = [
  { value: "", label: "Barchasi" },
  { value: "PENDING", label: "Moderatsiyada" },
  { value: "APPROVED", label: "Tasdiqlangan" },
  { value: "REJECTED", label: "Rad etilgan" },
  { value: "BLOCKED", label: "Bloklangan" },
];

const ALL = "all";

export function AdminStadiumsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
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
    page,
  };

  const stadiums = useQuery({
    queryKey: ["admin", "stadiums", query],
    queryFn: () => adminApi.stadiums(query),
    placeholderData: (previous) => previous,
  });

  const results = stadiums.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stadionlar</h1>
        <p className="text-sm text-muted-foreground">
          Platformadagi barcha maydonlar va ularning holati.
        </p>
      </div>

      <Tabs
        value={status || ALL}
        onValueChange={(value) => patch({ status: value === ALL ? "" : value })}
      >
        <TabsList className="grid w-full grid-cols-5">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value || ALL} value={tab.value || ALL}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            patch({ search: event.target.value });
          }}
          placeholder="Stadion nomi, shahar yoki arendator"
          className="pl-9"
        />
      </div>

      {stadiums.isError ? (
        <ErrorState
          message="Stadionlarni yuklab bo'lmadi."
          onRetry={() => void stadiums.refetch()}
        />
      ) : stadiums.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState icon={MapPin} title="Stadion topilmadi" description="Filtrlarni o'zgartiring." />
      ) : (
        <div className="space-y-4">
          {results.map((stadium) => (
            <StadiumModerationCard key={stadium.id} stadium={stadium} />
          ))}
          <Pagination
            page={page}
            count={stadiums.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
