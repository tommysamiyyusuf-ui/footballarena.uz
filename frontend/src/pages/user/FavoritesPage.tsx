import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { favoritesApi } from "@/api/misc";
import { Pagination } from "@/components/shared/Pagination";
import { StadiumCard, StadiumCardSkeleton } from "@/components/shared/StadiumCard";
import { EmptyState, ErrorState } from "@/components/shared/States";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 12;

export function FavoritesPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);

  const favorites = useQuery({
    queryKey: ["favorites", page],
    queryFn: () => favoritesApi.list(page),
    placeholderData: (previous) => previous,
  });

  const results = favorites.data?.results ?? [];

  return (
    <div className="container space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">Sevimli stadionlar</h1>
        <p className="text-sm text-muted-foreground">
          Saqlab qo'yganlaringiz shu yerda turadi.
        </p>
      </div>

      {favorites.isError ? (
        <ErrorState
          message="Sevimlilarni yuklab bo'lmadi."
          onRetry={() => void favorites.refetch()}
        />
      ) : favorites.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <StadiumCardSkeleton key={index} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Sevimlilar bo'sh"
          description="Yoqqan stadionni yurakcha tugmasi bilan saqlab qo'ying."
          action={
            <Button asChild>
              <Link to="/">Stadionlarni ko'rish</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((favorite) => (
              <StadiumCard key={favorite.id} stadium={favorite.stadium} />
            ))}
          </div>
          <Pagination
            page={page}
            count={favorites.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => setParams({ page: String(next) })}
          />
        </>
      )}
    </div>
  );
}
