import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { adminApi } from "@/api/panels";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { PlatformSettings } from "@/types/api";

type Draft = Omit<PlatformSettings, "created_at" | "updated_at">;

const TOGGLES: Array<{ key: keyof Draft; label: string; hint: string }> = [
  {
    key: "auto_approve_stadiums",
    label: "Stadionlarni avtomatik tasdiqlash",
    hint: "Yoqilsa yangi stadionlar moderatsiyasiz darhol mijozlarga ko'rinadi.",
  },
  {
    key: "notifications_email_enabled",
    label: "Email xabarnomalar",
    hint: "Bron holati o'zgarganda email yuboriladi.",
  },
  {
    key: "notifications_telegram_enabled",
    label: "Telegram xabarnomalar",
    hint: "Telegram ulagan foydalanuvchilarga bot orqali yuboriladi.",
  },
  {
    key: "maintenance_mode",
    label: "Texnik ishlar rejimi",
    hint: "Yoqilsa mijozlar yangi bron qila olmaydi. Admin panel ishlashda davom etadi.",
  },
];

const NUMBERS: Array<{ key: keyof Draft; label: string; hint: string }> = [
  {
    key: "booking_cancel_window_hours",
    label: "Bekor qilish oynasi (soat)",
    hint: "O'yin boshlanishiga shuncha soat qolganda bekor qilish yopiladi.",
  },
  {
    key: "booking_max_advance_days",
    label: "Oldindan bron (kun)",
    hint: "Necha kun oldin bron qilish mumkinligi.",
  },
  { key: "booking_min_duration_hours", label: "Minimal davomiylik (soat)", hint: "" },
  { key: "booking_max_duration_hours", label: "Maksimal davomiylik (soat)", hint: "" },
];

const TEXTS: Array<{ key: keyof Draft; label: string; placeholder: string }> = [
  { key: "support_phone", label: "Qo'llab-quvvatlash telefoni", placeholder: "+998901234567" },
  { key: "support_email", label: "Qo'llab-quvvatlash emaili", placeholder: "help@arena.uz" },
  { key: "support_telegram", label: "Telegram", placeholder: "@arena_support" },
];

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: adminApi.settings });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Seed the form once the server row arrives, and again after a successful save.
  useEffect(() => {
    if (!settings.data) return;
    const { created_at: _created, updated_at: _updated, ...rest } = settings.data;
    setDraft(rest);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (payload: Draft) => adminApi.updateSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "settings"], data);
      queryClient.invalidateQueries({ queryKey: ["config"] });
      setErrors({});
      toast.success("Sozlamalar saqlandi");
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

  if (settings.isLoading || !draft) {
    if (settings.isError) {
      return (
        <ErrorState
          message="Sozlamalarni yuklab bo'lmadi."
          onRetry={() => void settings.refetch()}
        />
      );
    }
    return <PageLoader className="py-24" />;
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const field = (key: keyof Draft) =>
    errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sozlamalar</h1>
          <p className="text-sm text-muted-foreground">
            Oxirgi o'zgarish: {formatDateTime(settings.data?.updated_at)}
          </p>
        </div>
        <Button type="submit" loading={save.isPending}>
          Saqlash
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Umumiy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="platform_name">Platforma nomi</Label>
            <Input
              id="platform_name"
              value={draft.platform_name}
              onChange={(event) => set("platform_name", event.target.value)}
            />
            {field("platform_name")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commission_percent">Komissiya (%)</Label>
            <Input
              id="commission_percent"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={draft.commission_percent}
              onChange={(event) => set("commission_percent", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Standart stavka. Har bir arendator uchun alohida qiymat belgilash mumkin.
            </p>
            {field("commission_percent")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bron qoidalari</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {NUMBERS.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <Label htmlFor={item.key}>{item.label}</Label>
              <Input
                id={item.key}
                type="number"
                min={0}
                value={String(draft[item.key])}
                onChange={(event) =>
                  set(item.key, Number(event.target.value) as Draft[typeof item.key])
                }
              />
              {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
              {field(item.key)}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rejimlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOGGLES.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={item.key}>{item.label}</Label>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
              <Switch
                id={item.key}
                checked={Boolean(draft[item.key])}
                onCheckedChange={(checked) =>
                  set(item.key, checked as Draft[typeof item.key])
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qo'llab-quvvatlash</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {TEXTS.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <Label htmlFor={item.key}>{item.label}</Label>
              <Input
                id={item.key}
                value={String(draft[item.key])}
                placeholder={item.placeholder}
                onChange={(event) =>
                  set(item.key, event.target.value as Draft[typeof item.key])
                }
              />
              {field(item.key)}
            </div>
          ))}
        </CardContent>
      </Card>
    </form>
  );
}
