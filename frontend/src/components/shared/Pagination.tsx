import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  count: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, count, pageSize, onChange }: PaginationProps) {
  const pages = Math.ceil(count / pageSize);
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        {from}–{to} / {count} ta
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Oldingi sahifa"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[5rem] text-center text-sm">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Keyingi sahifa"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
