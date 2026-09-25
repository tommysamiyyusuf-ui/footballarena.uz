import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Renders a reason box and passes its content to `onConfirm`. */
  reason?: { label: string; placeholder?: string; required?: boolean };
  onConfirm: (reason: string) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Tasdiqlash",
  destructive,
  loading,
  reason,
  onConfirm,
}: ConfirmDialogProps) {
  const [text, setText] = useState("");
  const blocked = Boolean(reason?.required) && text.trim().length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setText("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {reason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reason.label}</Label>
            <Textarea
              id="confirm-reason"
              value={text}
              placeholder={reason.placeholder}
              onChange={(event) => setText(event.target.value)}
              maxLength={500}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Bekor qilish
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            loading={loading}
            disabled={blocked}
            onClick={() => onConfirm(text.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
