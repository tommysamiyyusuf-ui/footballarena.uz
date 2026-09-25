import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { adminApi } from "@/api/panels";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 50;
const ANY = "any";

const ACTION_LABEL: Record<string, string> = {
  STADIUM_APPROVED: "Stadion tasdiqlandi",
  STADIUM_REJECTED: "Stadion rad etildi",
  STADIUM_BLOCKED: "Stadion bloklandi",
  STADIUM_CHANGES_REQUESTED: "O'zgartirish so'raldi",
  USER_BLOCKED: "Foydalanuvchi bloklandi",
  USER_UNBLOCKED: "Blok olindi",
  OWNER_CREATED: "Arendator yaratildi",
  OWNER_UPDATED: "Arendator tahrirlandi",
  OWNER_DELETED: "Arendator o'chirildi",
  BOOKING_UPDATED: "Bron o'zgartirildi",
  BOOKING_CANCELLED: "Bron bekor qilindi",
  REVIEW_HIDDEN: "Sharh yashirildi",
  REVIEW_RESTORED: "Sharh tiklandi",
  SETTINGS_UPDATED: "Sozlamalar yangilandi",
};

/** Anything removing or blocking something is shown in red. */
const DESTRUCTIVE = new Set([
  "STADIUM_REJECTED",
  "STADIUM_BLOCKED",
  "USER_BLOCKED",
  "OWNER_DELETED",
  "BOOKING_CANCELLED",
  "REVIEW_HIDDEN",
]);

const DAY_RANGES = [
  { value: "7", label: "7 kun" },
  { value: "30", label: "30 kun" },
  { value: "90", label: "90 kun" },
];

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") ?? "";
  const days = params.get("days") ?? "30";
  const page = Number(params.get("page") ?? 1);

  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!changes.page) next.delete("page");
    setParams(next);
  };

  const query = { action: action || undefined, days, page };
  const logs = useQuery({
    queryKey: ["admin", "audit", query],
    queryFn: () => adminApi.auditLogs(query),
    placeholderData: (previous) => previous,
  });

  const results = logs.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit jurnali</h1>
        <p className="text-sm text-muted-foreground">
          Har bir moderatsiya va boshqaruv amali shu yerda qayd etiladi.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={action || ANY}
          onValueChange={(value) => patch({ action: value === ANY ? "" : value })}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Amal turi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Barcha amallar</SelectItem>
            {Object.entries(ACTION_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={days} onValueChange={(value) => patch({ days: value })}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {logs.isError ? (
        <ErrorState message="Jurnalni yuklab bo'lmadi." onRetry={() => void logs.refetch()} />
      ) : logs.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Yozuv topilmadi"
          description="Tanlangan davrda amal bajarilmagan."
        />
      ) : (
        <div className="space-y-2">
          {results.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={DESTRUCTIVE.has(entry.action) ? "destructive" : "secondary"}>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </Badge>
                  <span className="text-sm font-medium">{entry.actor_name || "Tizim"}</span>
                </div>
                {entry.description && <p className="text-sm">{entry.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {entry.target_type ? `${entry.target_type} · ${entry.target_id}` : "—"}
                  {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(entry.created_at)}
              </span>
            </div>
          ))}

          <Pagination
            page={page}
            count={logs.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
