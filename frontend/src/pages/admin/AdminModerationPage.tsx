import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { adminApi } from "@/api/panels";
import { StadiumModerationCard } from "@/components/admin/StadiumModerationCard";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";

const PAGE_SIZE = 50;

export function AdminModerationPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);

  const pending = useQuery({
    queryKey: ["admin", "stadiums", "pending", page],
    queryFn: () => adminApi.pendingStadiums(page),
    placeholderData: (previous) => previous,
    refetchInterval: 15_000,
  });

  const results = pending.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moderatsiya navbati</h1>
        <p className="text-sm text-muted-foreground">
          Faqat tasdiqlangan stadionlar mijozlarga ko'rinadi.
        </p>
      </div>

      {pending.isError ? (
        <ErrorState message="Navbatni yuklab bo'lmadi." onRetry={() => void pending.refetch()} />
      ) : pending.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Navbat bo'sh"
          description="Yangi stadion yuborilganda shu yerda paydo bo'ladi."
        />
      ) : (
        <div className="space-y-4">
          {results.map((stadium) => (
            <StadiumModerationCard key={stadium.id} stadium={stadium} />
          ))}
          <Pagination
            page={page}
            count={pending.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => setParams({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
