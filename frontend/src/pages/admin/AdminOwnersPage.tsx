import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Pencil, Plus, Search, Trash2, UserCheck, UserCog } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { adminApi, type OwnerCreatePayload } from "@/api/panels";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState, ErrorState, PageLoader } from "@/components/shared/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatCompactSum, formatPhone } from "@/lib/format";
import type { AdminOwner } from "@/types/api";

const PAGE_SIZE = 50;
const ALL = "all";

const TABS = [
  { value: "", label: "Barchasi" },
  { value: "active", label: "Faol" },
  { value: "blocked", label: "Bloklangan" },
];

export function AdminOwnersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const search = useDebounce(searchInput, 400);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminOwner | null>(null);
  const [blocking, setBlocking] = useState<AdminOwner | null>(null);
  const [deleting, setDeleting] = useState<AdminOwner | null>(null);

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
  const owners = useQuery({
    queryKey: ["admin", "owners", query],
    queryFn: () => adminApi.owners(query),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const block = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.blockOwner(id, reason),
    onSuccess: () => {
      invalidate();
      setBlocking(null);
      toast.success("Arendator bloklandi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const unblock = useMutation({
    mutationFn: (id: string) => adminApi.unblockOwner(id),
    onSuccess: () => {
      invalidate();
      toast.success("Blok olib tashlandi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteOwner(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Arendator o'chirildi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const results = owners.data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Arendatorlar</h1>
          <p className="text-sm text-muted-foreground">
            Arendator hisobi faqat shu yerdan yaratiladi — o'zi ro'yxatdan o'ta olmaydi.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Arendator qo'shish
        </Button>
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
          placeholder="Ism, login, telefon yoki kompaniya"
          className="pl-9"
        />
      </div>

      {owners.isError ? (
        <ErrorState
          message="Arendatorlarni yuklab bo'lmadi."
          onRetry={() => void owners.refetch()}
        />
      ) : owners.isLoading ? (
        <PageLoader className="py-16" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Arendator topilmadi"
          description="Yangi arendator yarating yoki filtrlarni o'zgartiring."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arendator</TableHead>
                  <TableHead>Kompaniya</TableHead>
                  <TableHead className="text-right">Stadion</TableHead>
                  <TableHead className="text-right">Tushum</TableHead>
                  <TableHead className="text-right">Komissiya</TableHead>
                  <TableHead className="text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((owner) => (
                  <TableRow key={owner.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{owner.full_name || owner.username}</p>
                          <p className="text-xs text-muted-foreground">
                            @{owner.username} · {formatPhone(owner.phone)}
                          </p>
                        </div>
                        {owner.is_blocked && <Badge variant="destructive">Bloklangan</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{owner.company_name || "—"}</TableCell>
                    <TableCell className="text-right">{owner.stadium_count}</TableCell>
                    <TableCell className="text-right">
                      {formatCompactSum(owner.total_revenue)}
                    </TableCell>
                    <TableCell className="text-right">{owner.commission_percent}%</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Tahrirlash"
                          onClick={() => {
                            setEditing(owner);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {owner.is_blocked ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Blokni olish"
                            disabled={unblock.isPending}
                            onClick={() => unblock.mutate(owner.id)}
                          >
                            <UserCheck className="h-4 w-4 text-success" />
                          </Button>
                        ) : (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Bloklash"
                            onClick={() => setBlocking(owner)}
                          >
                            <Ban className="h-4 w-4 text-warning" />
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="O'chirish"
                          onClick={() => setDeleting(owner)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            count={owners.data?.count ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(next) => patch({ page: String(next) })}
          />
        </>
      )}

      <OwnerFormDialog
        open={formOpen}
        owner={editing}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(blocking)}
        onOpenChange={(open) => !open && setBlocking(null)}
        title="Arendatorni bloklaysizmi?"
        description={`${blocking?.full_name} tizimga kira olmaydi va stadionlari yashiriladi.`}
        confirmLabel="Bloklash"
        destructive
        loading={block.isPending}
        reason={{ label: "Sabab", required: true }}
        onConfirm={(reason) => blocking && block.mutate({ id: blocking.id, reason })}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Arendatorni o'chirasizmi?"
        description="Bu amalni ortga qaytarib bo'lmaydi. Bronlar tarixi mavjud bo'lsa server o'chirishni rad etadi — bunday holatda bloklashdan foydalaning."
        confirmLabel="O'chirish"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  company_name: "",
  tax_id: "",
  commission_percent: "",
};

function OwnerFormDialog({
  open,
  owner,
  onOpenChange,
}: {
  open: boolean;
  owner: AdminOwner | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(owner);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Re-seed whenever the dialog switches to a different record.
  const key = owner?.id ?? "new";
  if (open && seededFor !== key) {
    setSeededFor(key);
    setErrors({});
    setForm(
      owner
        ? {
            first_name: owner.first_name,
            last_name: owner.last_name,
            phone: owner.phone,
            email: owner.email,
            username: owner.username,
            password: "",
            company_name: owner.company_name,
            tax_id: "",
            commission_percent: owner.commission_percent,
          }
        : EMPTY_FORM,
    );
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<OwnerCreatePayload> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        company_name: form.company_name.trim() || undefined,
        tax_id: form.tax_id.trim() || undefined,
        commission_percent: form.commission_percent || undefined,
      };
      if (isEdit && owner) {
        // An empty password field means "leave the current one alone".
        if (form.password) payload.password = form.password;
        return adminApi.updateOwner(owner.id, payload);
      }
      return adminApi.createOwner({
        ...(payload as OwnerCreatePayload),
        username: form.username.trim(),
        password: form.password,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      onOpenChange(false);
      toast.success(isEdit ? "Ma'lumotlar saqlandi" : "Arendator yaratildi");
    },
    onError: (error) => {
      const parsed = toApiError(error);
      const fieldErrors: Record<string, string> = {};
      for (const [field, value] of Object.entries(parsed.errors ?? {})) {
        fieldErrors[field] = Array.isArray(value) ? value[0] : String(value);
      }
      setErrors(fieldErrors);
      toast.error(parsed.message);
    },
  });

  const update = (changes: Partial<typeof EMPTY_FORM>) =>
    setForm((current) => ({ ...current, ...changes }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Arendatorni tahrirlash" : "Yangi arendator"}</DialogTitle>
          <DialogDescription>
            Login va parolni arendatorga xavfsiz kanal orqali yetkazing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <DialogField label="Ism *" error={errors.first_name}>
            <Input
              value={form.first_name}
              onChange={(event) => update({ first_name: event.target.value })}
            />
          </DialogField>
          <DialogField label="Familiya" error={errors.last_name}>
            <Input
              value={form.last_name}
              onChange={(event) => update({ last_name: event.target.value })}
            />
          </DialogField>
          <DialogField label="Telefon *" error={errors.phone}>
            <Input
              value={form.phone}
              onChange={(event) => update({ phone: event.target.value })}
              placeholder="+998901234567"
            />
          </DialogField>
          <DialogField label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => update({ email: event.target.value })}
            />
          </DialogField>
          <DialogField label="Login *" error={errors.username}>
            <Input
              value={form.username}
              disabled={isEdit}
              autoComplete="off"
              onChange={(event) => update({ username: event.target.value })}
              placeholder="owner_arena"
            />
          </DialogField>
          <DialogField
            label={isEdit ? "Yangi parol" : "Parol *"}
            error={errors.password}
          >
            <Input
              type="password"
              value={form.password}
              autoComplete="new-password"
              onChange={(event) => update({ password: event.target.value })}
              placeholder={isEdit ? "O'zgartirmaslik uchun bo'sh qoldiring" : "Kamida 8 belgi"}
            />
          </DialogField>
          <DialogField label="Kompaniya" error={errors.company_name}>
            <Input
              value={form.company_name}
              onChange={(event) => update({ company_name: event.target.value })}
            />
          </DialogField>
          <DialogField label="STIR" error={errors.tax_id}>
            <Input
              value={form.tax_id}
              onChange={(event) => update({ tax_id: event.target.value })}
            />
          </DialogField>
          <DialogField
            label="Komissiya (%)"
            error={errors.commission_percent}
            className="sm:col-span-2"
          >
            <Input
              inputMode="decimal"
              value={form.commission_percent}
              onChange={(event) =>
                update({ commission_percent: event.target.value.replace(/[^\d.]/g, "") })
              }
              placeholder="Bo'sh qoldirilsa platforma foizi qo'llanadi"
            />
          </DialogField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button
            loading={save.isPending}
            disabled={
              !form.first_name.trim() ||
              !form.phone.trim() ||
              (!isEdit && (!form.username.trim() || !form.password))
            }
            onClick={() => save.mutate()}
          >
            {isEdit ? "Saqlash" : "Yaratish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogField({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
