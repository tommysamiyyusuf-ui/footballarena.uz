import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarDays, Search, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { adminApi } from "@/api/panels";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { BookingStatusBadge } from "@/components/shared/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { toApiError } from "@/lib/api";
import { formatCompactSum, formatDate, formatPhone, initials } from "@/lib/format";
import type { AdminUser } from "@/types/api";

const PAGE_SIZE = 50;
const ALL = "all";

const TABS = [
  { value: "", label: "Barchasi" },
  { value: "active", label: "Faol" },
  { value: "blocked", label: "Bloklangan" },
];

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const search = useDebounce(searchInput, 400);

  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const [viewing, setViewing] = useState<AdminUser | null>(null);

  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!changes.page) next.delete("page");
    setParams(next);
  };

  const query = { status: status || undefined, search: search || undefined, page };
  const users = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => adminApi.users(query),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const block = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.blockUser(id, reason),
    onSuccess: () => {
      invalidate();
      setBlocking(null);
      toast.success("Foydalanuvchi bloklandi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const unblock = useMutation({
    mutationFn: (id: string) => adminApi.unblockUser(id),
    onSuccess: () => {
      invalidate();
      toast.success("Blok olib tashlandi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const results = users.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Foydalanuvchilar</h1>
        <p className="text-sm text-muted-foreground">
          Bloklangan hisob tizimga kira olmaydi va yangi bron qila olmaydi.
        </p>
      </div>

      <Tabs
        value={status || ALL}
        onValueChange={(value) => patch({ status: value === ALL ? "" : value })}
      >
        <TabsList className="grid w-full grid-cols-3">
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
          placeholder="Ism, telefon yoki email"
          className="pl-9"
        />
      </div>

      {users.isError ? (
        <ErrorState
          message="Foydalanuvchilarni yuklab bo'lmadi."
          onRetry={() => void users.refetch()}
        />
      ) : users.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Foydalanuvchi topilmadi"
          description="Filtrlarni o'zgartiring."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Foydalanuvchi</TableHead>
                  <TableHead>Ro'yxatdan o'tgan</TableHead>
                  <TableHead className="text-right">Bronlar</TableHead>
                  <TableHead className="text-right">Sarflagan</TableHead>
                  <TableHead className="text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          {user.avatar && <AvatarImage src={user.avatar} alt="" />}
                          <AvatarFallback>{initials(user.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            <span className="truncate">{user.full_name || "Ismsiz"}</span>
                            {user.is_blocked && (
                              <Badge variant="destructive">Bloklangan</Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatPhone(user.phone)}
                            {user.email ? ` · ${user.email}` : ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.booking_count}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({user.completed_bookings})
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatCompactSum(user.total_spent)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Bronlari"
                          onClick={() => setViewing(user)}
                        >
                          <CalendarDays className="h-4 w-4" />
                        </Button>
                        {user.is_blocked ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Blokni olish"
                            disabled={unblock.isPending}
                            onClick={() => unblock.mutate(user.id)}
                          >
                            <UserCheck className="h-4 w-4 text-success" />
                          </Button>
                        ) : (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Bloklash"
                            onClick={() => setBlocking(user)}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            count={users.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </>
      )}

      {blocking && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setBlocking(null)}
          title={`${blocking.full_name || "Foydalanuvchi"}ni bloklaysizmi?`}
          description="Hisob tizimga kira olmaydi. Sabab audit jurnalida saqlanadi."
          confirmLabel="Bloklash"
          destructive
          loading={block.isPending}
          reason={{ label: "Bloklash sababi", required: true }}
          onConfirm={(reason) => block.mutate({ id: blocking.id, reason })}
        />
      )}

      <UserBookingsDialog user={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/** Read-only booking history, opened from the table. */
function UserBookingsDialog({
  user,
  onClose,
}: {
  user: AdminUser | null;
  onClose: () => void;
}) {
  const bookings = useQuery({
    queryKey: ["admin", "users", user?.id, "bookings"],
    queryFn: () => adminApi.userBookings(user!.id),
    enabled: Boolean(user),
  });

  const results = bookings.data?.results ?? [];

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user?.full_name || "Foydalanuvchi"} bronlari</DialogTitle>
          <DialogDescription>
            Oxirgi {bookings.data?.count ?? 0} ta brondan birinchi sahifasi.
          </DialogDescription>
        </DialogHeader>

        {bookings.isLoading ? (
          <PageLoader className="min-h-[30vh] py-10" />
        ) : bookings.isError ? (
          <ErrorState message="Bronlarni yuklab bo'lmadi." onRetry={() => void bookings.refetch()} />
        ) : results.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Bron yo'q" />
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {results.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{booking.stadium_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(booking.date)} · {booking.start_time.slice(0, 5)}–
                    {booking.end_time.slice(0, 5)} · #{booking.reference}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCompactSum(booking.total_price)}
                  </span>
                  <BookingStatusBadge status={booking.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
