import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, MapPin, MessageSquareWarning, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { adminApi } from "@/api/panels";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Rating } from "@/components/shared/Rating";
import { StadiumStatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { FIELD_TYPE_LABEL } from "@/lib/constants";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import type { ModerationAction, StadiumDetail } from "@/types/api";

const DIALOGS: Record<
  Exclude<ModerationAction, "APPROVE">,
  { title: string; description: string; confirmLabel: string; reasonLabel: string }
> = {
  REJECT: {
    title: "Stadionni rad etasizmi?",
    description: "Arendator sababni ko'radi va tuzatib qayta yuborishi mumkin.",
    confirmLabel: "Rad etish",
    reasonLabel: "Rad etish sababi",
  },
  REQUEST_CHANGES: {
    title: "O'zgartirish so'raysizmi?",
    description: "Stadion moderatsiyada qoladi, arendator izohingizni ko'radi.",
    confirmLabel: "So'rov yuborish",
    reasonLabel: "Nimani tuzatish kerak",
  },
  BLOCK: {
    title: "Stadionni bloklaysizmi?",
    description: "Stadion mijozlarga ko'rinmaydi va yangi bron qabul qilmaydi.",
    confirmLabel: "Bloklash",
    reasonLabel: "Bloklash sababi",
  },
};

/**
 * One moderation decision per card. Approve is immediate; everything else
 * demands a written note because the owner is shown it verbatim.
 */
export function StadiumModerationCard({ stadium }: { stadium: StadiumDetail }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Exclude<ModerationAction, "APPROVE"> | null>(null);

  const moderate = useMutation({
    mutationFn: ({ action, note }: { action: ModerationAction; note: string }) =>
      adminApi.moderateStadium(stadium.id, action, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["stadiums"] });
      setDialog(null);
      toast.success("Holat yangilandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const config = dialog ? DIALOGS[dialog] : null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="h-40 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-32 sm:w-48">
          {stadium.cover_image ? (
            <img src={stadium.cover_image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Rasm yo'q
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/stadiums/${stadium.id}`}
                className="truncate font-semibold hover:underline"
              >
                {stadium.name}
              </Link>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {[stadium.district, stadium.city, stadium.address].filter(Boolean).join(", ")}
                </span>
              </p>
            </div>
            <StadiumStatusBadge status={stadium.status} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">
              {FIELD_TYPE_LABEL[stadium.field_type] ?? stadium.field_type_display}
            </Badge>
            <Badge variant="secondary">{formatMoney(stadium.price_per_hour)} so'm/soat</Badge>
            <Badge variant="secondary">{stadium.images.length} ta rasm</Badge>
            <Rating value={stadium.rating} count={stadium.review_count} />
          </div>

          <p className="text-sm text-muted-foreground">
            Arendator: {stadium.owner?.company_name || stadium.owner?.name || "—"}
            {stadium.owner?.phone ? ` · ${formatPhone(stadium.owner.phone)}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Yuborilgan: {formatDate(stadium.created_at)}
          </p>

          {stadium.description && (
            <p className="line-clamp-2 text-sm">{stadium.description}</p>
          )}

          {stadium.moderation_note && (
            <p className="rounded-lg bg-muted p-2 text-xs">
              Oxirgi izoh: {stadium.moderation_note}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
        {stadium.status !== "APPROVED" && (
          <Button
            size="sm"
            variant="success"
            loading={moderate.isPending && moderate.variables?.action === "APPROVE"}
            onClick={() => moderate.mutate({ action: "APPROVE", note: "" })}
          >
            <Check className="h-4 w-4" />
            Tasdiqlash
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setDialog("REQUEST_CHANGES")}>
          <MessageSquareWarning className="h-4 w-4" />
          O'zgartirish so'rash
        </Button>
        {stadium.status !== "REJECTED" && (
          <Button size="sm" variant="outline" onClick={() => setDialog("REJECT")}>
            <X className="h-4 w-4" />
            Rad etish
          </Button>
        )}
        {stadium.status !== "BLOCKED" && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setDialog("BLOCK")}
          >
            <Ban className="h-4 w-4" />
            Bloklash
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link to={`/stadiums/${stadium.id}`}>Batafsil</Link>
        </Button>
      </div>

      {config && dialog && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={config.title}
          description={config.description}
          confirmLabel={config.confirmLabel}
          destructive={dialog !== "REQUEST_CHANGES"}
          loading={moderate.isPending}
          reason={{ label: config.reasonLabel, required: true }}
          onConfirm={(note) => moderate.mutate({ action: dialog, note })}
        />
      )}
    </div>
  );
}
