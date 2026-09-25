import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { bookingsApi } from "@/api/bookings";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import type { BookingListItem } from "@/types/api";

/**
 * Approve / reject controls for a pending request. Rejection always carries a
 * reason so the customer sees why, and every mutation refreshes the analytics
 * queries the decision feeds into.
 */
export function OwnerBookingActions({ booking }: { booking: BookingListItem }) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["owner"] });
    queryClient.invalidateQueries({ queryKey: ["availability"] });
  };

  const approve = useMutation({
    mutationFn: () => bookingsApi.approve(booking.id),
    onSuccess: () => {
      refresh();
      toast.success("Bron tasdiqlandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => bookingsApi.reject(booking.id, reason),
    onSuccess: () => {
      refresh();
      setRejectOpen(false);
      toast.success("Bron rad etildi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (booking.status !== "PENDING") return null;

  return (
    <>
      <Button
        size="sm"
        variant="success"
        loading={approve.isPending}
        onClick={() => approve.mutate()}
      >
        <Check className="h-4 w-4" />
        Tasdiqlash
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
        <X className="h-4 w-4" />
        Rad etish
      </Button>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Bronni rad etasizmi?"
        description={`${booking.stadium.name} · ${booking.date} ${booking.start_time}`}
        confirmLabel="Rad etish"
        destructive
        loading={reject.isPending}
        reason={{
          label: "Sabab",
          placeholder: "Bu vaqtda texnik ishlar rejalashtirilgan",
          required: true,
        }}
        onConfirm={(reason) => reject.mutate(reason)}
      />
    </>
  );
}
