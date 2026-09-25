import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { stadiumsApi } from "@/api/stadiums";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { StadiumCard, StadiumCardSkeleton } from "@/components/shared/StadiumCard";
import { EmptyState, ErrorState } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

const PAGE_SIZE = 12;

export function OwnerStadiumsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const query = { mine: true, page, page_size: PAGE_SIZE };
  const stadiums = useQuery({
    queryKey: ["stadiums", query],
    queryFn: () => stadiumsApi.list(query),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (id: string) => stadiumsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stadiums"] });
      queryClient.invalidateQueries({ queryKey: ["owner"] });
      setToDelete(null);
      toast.success("Stadion o'chirildi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const results = stadiums.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stadionlarim</h1>
          <p className="text-sm text-muted-foreground">
            Yangi stadion admin tasdiqlagandan keyin mijozlarga ko'rinadi.
          </p>
        </div>
        <Button asChild>
          <Link to="/owner/stadiums/new">
            <Plus className="h-4 w-4" />
            Stadion qo'shish
          </Link>
        </Button>
      </div>

      {stadiums.isError ? (
        <ErrorState
          message="Stadionlarni yuklab bo'lmadi."
          onRetry={() => void stadiums.refetch()}
        />
      ) : stadiums.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <StadiumCardSkeleton key={index} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Stadion qo'shilmagan"
          description="Birinchi stadionni qo'shing va bronlarni qabul qilishni boshlang."
          action={
            <Button asChild>
              <Link to="/owner/stadiums/new">Stadion qo'shish</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((stadium) => (
              <div key={stadium.id} className="space-y-2">
                <StadiumCard
                  stadium={stadium}
                  showStatus
                  to={`/owner/stadiums/${stadium.id}`}
                />
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link to={`/owner/stadiums/${stadium.id}`}>
                      <Pencil className="h-4 w-4" />
                      Tahrirlash
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setToDelete({ id: stadium.id, name: stadium.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={page}
            count={stadiums.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => setParams({ page: String(next) })}
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Stadionni o'chirasizmi?"
        description={`"${toDelete?.name}" o'chiriladi. Faol bronlar mavjud bo'lsa server o'chirishga ruxsat bermaydi.`}
        confirmLabel="O'chirish"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}
