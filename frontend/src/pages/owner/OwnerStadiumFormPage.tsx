import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { stadiumsApi } from "@/api/stadiums";
import { LocationPicker } from "@/components/map/LocationPicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState, PageLoader } from "@/components/shared/States";
import { StadiumStatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toApiError } from "@/lib/api";
import { DEFAULT_CENTER, FIELD_TYPES, WEEKDAYS } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/format";
import type { FieldType, StadiumWritePayload } from "@/types/api";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface HoursRow {
  weekday: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

const DEFAULT_HOURS: HoursRow[] = WEEKDAYS.map((day) => ({
  weekday: day.value,
  open_time: "08:00",
  close_time: "23:00",
  is_closed: false,
}));

export function OwnerStadiumFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    description: "",
    field_type: "F5" as FieldType,
    capacity: "",
    price_per_hour: "",
    city: "",
    district: "",
    address: "",
    phone: "",
    is_active: true,
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [amenityIds, setAmenityIds] = useState<number[]>([]);
  const [hours, setHours] = useState<HoursRow[]>(DEFAULT_HOURS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const stadium = useQuery({
    queryKey: ["stadium", id],
    queryFn: () => stadiumsApi.detail(id as string),
    enabled: isEdit,
  });

  const amenities = useQuery({
    queryKey: ["amenities"],
    queryFn: stadiumsApi.amenities,
    staleTime: 60 * 60 * 1000,
  });

  // Seed the form once the record arrives; the query is the source of truth.
  useEffect(() => {
    const data = stadium.data;
    if (!data) return;
    setForm({
      name: data.name,
      description: data.description,
      field_type: data.field_type,
      capacity: data.capacity ? String(data.capacity) : "",
      price_per_hour: data.price_per_hour,
      city: data.city,
      district: data.district,
      address: data.address,
      phone: data.phone,
      is_active: data.is_active,
    });
    setCoords({ lat: data.latitude, lng: data.longitude });
    setAmenityIds(data.amenities.map((amenity) => amenity.id));
    setHours(
      WEEKDAYS.map((day) => {
        const row = data.working_hours.find((item) => item.weekday === day.value);
        return {
          weekday: day.value,
          open_time: row?.open_time?.slice(0, 5) ?? "08:00",
          close_time: row?.close_time?.slice(0, 5) ?? "23:00",
          is_closed: row?.is_closed ?? false,
        };
      }),
    );
  }, [stadium.data]);

  const buildPayload = (): StadiumWritePayload | null => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Nomi majburiy.";
    if (!form.city.trim()) next.city = "Shahar majburiy.";
    if (!form.address.trim()) next.address = "Manzil majburiy.";
    if (!form.price_per_hour || Number(form.price_per_hour) <= 0)
      next.price_per_hour = "Narx 0 dan katta bo'lishi kerak.";
    if (!coords) next.location = "Xaritadan joylashuvni belgilang.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !coords) return null;

    return {
      name: form.name.trim(),
      description: form.description.trim(),
      field_type: form.field_type,
      capacity: form.capacity ? Number(form.capacity) : null,
      price_per_hour: String(form.price_per_hour),
      city: form.city.trim(),
      district: form.district.trim(),
      address: form.address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      phone: form.phone.trim(),
      is_active: form.is_active,
      amenity_ids: amenityIds,
      working_hours: hours.map((row) => ({
        weekday: row.weekday,
        open_time: row.is_closed ? null : row.open_time,
        close_time: row.is_closed ? null : row.close_time,
        is_closed: row.is_closed,
      })),
    };
  };

  const save = useMutation({
    mutationFn: (payload: StadiumWritePayload) =>
      isEdit ? stadiumsApi.update(id as string, payload) : stadiumsApi.create(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stadiums"] });
      queryClient.invalidateQueries({ queryKey: ["stadium", data.id] });
      queryClient.invalidateQueries({ queryKey: ["owner"] });
      toast.success(
        isEdit
          ? "Saqlandi"
          : "Stadion yaratildi. Admin tasdiqlagach mijozlarga ko'rinadi.",
      );
      if (!isEdit) navigate(`/owner/stadiums/${data.id}`, { replace: true });
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

  if (isEdit && stadium.isLoading) return <PageLoader className="py-24" />;
  if (isEdit && (stadium.isError || !stadium.data)) {
    return (
      <ErrorState message="Stadion topilmadi." onRetry={() => void stadium.refetch()} />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => navigate("/owner/stadiums")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Stadionlarim
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {isEdit ? stadium.data?.name : "Yangi stadion"}
        </h1>
        {isEdit && stadium.data && <StadiumStatusBadge status={stadium.data.status} />}
      </div>

      {isEdit && stadium.data?.moderation_note && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Moderator izohi</p>
            <p className="mt-1 text-muted-foreground">{stadium.data.moderation_note}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Asosiy ma'lumot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Stadion nomi *" error={errors.name} className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Bunyodkor Arena"
            />
          </FormField>

          <FormField label="Tavsif" error={errors.description} className="sm:col-span-2">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Sun'iy qoplama, yoritish, yechinish xonasi…"
            />
          </FormField>

          <FormField label="Maydon turi" error={errors.field_type}>
            <Select
              value={form.field_type}
              onValueChange={(value) => setForm({ ...form, field_type: value as FieldType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Sig'imi (kishi)" error={errors.capacity}>
            <Input
              inputMode="numeric"
              value={form.capacity}
              onChange={(event) =>
                setForm({ ...form, capacity: event.target.value.replace(/\D/g, "").slice(0, 5) })
              }
              placeholder="22"
            />
          </FormField>

          <FormField label="Soatlik narx (so'm) *" error={errors.price_per_hour}>
            <Input
              inputMode="numeric"
              value={form.price_per_hour}
              onChange={(event) =>
                setForm({
                  ...form,
                  price_per_hour: event.target.value.replace(/[^\d.]/g, "").slice(0, 12),
                })
              }
              placeholder="250000"
            />
          </FormField>

          <FormField label="Telefon" error={errors.phone}>
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="+998901234567"
            />
          </FormField>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Bronlarni qabul qilish</p>
              <p className="text-xs text-muted-foreground">
                O'chirilsa stadion ro'yxatda ko'rinmaydi va yangi bron qabul qilinmaydi.
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(value) => setForm({ ...form, is_active: value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Joylashuv</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Shahar *" error={errors.city}>
              <Input
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                placeholder="Toshkent"
              />
            </FormField>
            <FormField label="Tuman" error={errors.district}>
              <Input
                value={form.district}
                onChange={(event) => setForm({ ...form, district: event.target.value })}
                placeholder="Chilonzor"
              />
            </FormField>
            <FormField label="Manzil *" error={errors.address} className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder="Bunyodkor shoh ko'chasi, 12"
              />
            </FormField>
          </div>

          <div className="space-y-2">
            <Label>Xaritadagi nuqta *</Label>
            <p className="text-xs text-muted-foreground">
              Xaritani bosing yoki belgini suring — mijozlar shu nuqtaga yo'l oladi.
            </p>
            <LocationPicker
              latitude={coords?.lat ?? DEFAULT_CENTER.lat}
              longitude={coords?.lng ?? DEFAULT_CENTER.lng}
              onChange={({ lat, lng, address }) => {
                setCoords({ lat, lng });
                if (address && !form.address.trim()) setForm((prev) => ({ ...prev, address }));
              }}
              className="h-80 w-full overflow-hidden rounded-lg border"
            />
            {coords && (
              <p className="text-xs text-muted-foreground">
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </p>
            )}
            {errors.location && (
              <p className="text-sm text-destructive">{errors.location}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qulayliklar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {amenities.data?.map((amenity) => {
            const checked = amenityIds.includes(amenity.id);
            return (
              <label key={amenity.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    setAmenityIds((current) =>
                      checked
                        ? current.filter((value) => value !== amenity.id)
                        : [...current, amenity.id],
                    )
                  }
                />
                {amenity.name_uz || amenity.name}
              </label>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ish vaqti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hours.map((row, index) => (
            <div key={row.weekday} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm font-medium">
                {WEEKDAYS[index].label}
              </span>
              <Input
                type="time"
                value={row.open_time}
                disabled={row.is_closed}
                onChange={(event) =>
                  setHours((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, open_time: event.target.value } : item,
                    ),
                  )
                }
                className="w-32"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="time"
                value={row.close_time}
                disabled={row.is_closed}
                onChange={(event) =>
                  setHours((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, close_time: event.target.value } : item,
                    ),
                  )
                }
                className="w-32"
              />
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={row.is_closed}
                  onCheckedChange={(value) =>
                    setHours((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, is_closed: value === true } : item,
                      ),
                    )
                  }
                />
                Yopiq
              </label>
            </div>
          ))}
          {errors.working_hours && (
            <p className="text-sm text-destructive">{errors.working_hours}</p>
          )}
        </CardContent>
      </Card>

      {isEdit && id && (
        <>
          <StadiumImages stadiumId={id} />
          <StadiumBlackouts stadiumId={id} />
        </>
      )}

      <div className="sticky bottom-16 z-20 flex gap-3 rounded-xl border bg-background p-4 shadow-lg lg:bottom-4">
        <Button
          className="flex-1"
          loading={save.isPending}
          onClick={() => {
            const payload = buildPayload();
            if (!payload) {
              toast.error("Majburiy maydonlarni to'ldiring.");
              return;
            }
            save.mutate(payload);
          }}
        >
          {isEdit ? "Saqlash" : "Yaratish"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/owner/stadiums")}>
          Bekor qilish
        </Button>
      </div>
    </div>
  );
}

function FormField({
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

// --- Images ------------------------------------------------------------------

function StadiumImages({ stadiumId }: { stadiumId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const stadium = useQuery({
    queryKey: ["stadium", stadiumId],
    queryFn: () => stadiumsApi.detail(stadiumId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["stadium", stadiumId] });

  const upload = useMutation({
    mutationFn: (files: File[]) => stadiumsApi.uploadImages(stadiumId, files),
    onSuccess: () => {
      invalidate();
      toast.success("Rasmlar yuklandi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const remove = useMutation({
    mutationFn: (imageId: string) => stadiumsApi.deleteImage(stadiumId, imageId),
    onSuccess: invalidate,
    onError: (error) => toast.error(toApiError(error).message),
  });

  const setCover = useMutation({
    mutationFn: (imageId: string) => stadiumsApi.setCover(stadiumId, imageId),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["stadiums"] });
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const images = stadium.data?.images ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Rasmlar</CardTitle>
        <Button
          variant="outline"
          size="sm"
          loading={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          Yuklash
        </Button>
      </CardHeader>
      <CardContent>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length === 0) return;
            const invalid = files.find(
              (file) => !ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES,
            );
            if (invalid) {
              toast.error("Faqat JPG/PNG/WEBP, har biri 5 MB gacha.");
              return;
            }
            upload.mutate(files);
          }}
        />

        {images.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Rasm yo'q. Yaxshi rasmlar bron sonini oshiradi.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-lg border">
                <img
                  src={image.image}
                  alt={image.caption}
                  className="aspect-[4/3] w-full object-cover"
                />
                {image.is_cover && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Asosiy
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/70 to-transparent p-2">
                  {!image.is_cover && (
                    <Button
                      size="icon-sm"
                      variant="secondary"
                      aria-label="Asosiy qilish"
                      disabled={setCover.isPending}
                      onClick={() => setCover.mutate(image.id)}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="destructive"
                    aria-label="O'chirish"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(image.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Blackouts ---------------------------------------------------------------

function StadiumBlackouts({ stadiumId }: { stadiumId: string }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [toDelete, setToDelete] = useState<string | null>(null);

  const blackouts = useQuery({
    queryKey: ["blackouts", stadiumId],
    queryFn: () => stadiumsApi.blackouts(stadiumId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["blackouts", stadiumId] });
    queryClient.invalidateQueries({ queryKey: ["availability", stadiumId] });
  };

  const create = useMutation({
    mutationFn: () =>
      stadiumsApi.createBlackout(stadiumId, {
        date,
        start_time: start || undefined,
        end_time: end || undefined,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setDate("");
      setStart("");
      setEnd("");
      setReason("");
      toast.success("Yopiq vaqt qo'shildi");
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  const remove = useMutation({
    mutationFn: (blackoutId: string) => stadiumsApi.deleteBlackout(stadiumId, blackoutId),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
    },
    onError: (error) => toast.error(toApiError(error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yopiq vaqtlar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Texnik ish yoki shaxsiy o'yin uchun vaqtni yoping — bu vaqtga bron qabul
          qilinmaydi. Vaqtni bo'sh qoldirsangiz kun to'liq yopiladi.
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Sana</Label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Boshlanish</Label>
            <Input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tugash</Label>
            <Input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sabab</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Texnik ish"
            />
          </div>
        </div>

        <Button
          variant="outline"
          disabled={!date}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          Qo'shish
        </Button>

        <div className="space-y-2">
          {blackouts.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Yopiq vaqtlar yo'q.</p>
          )}
          {blackouts.data?.map((blackout) => (
            <div
              key={blackout.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {formatDate(blackout.date)}
                  {blackout.start_time
                    ? ` · ${formatTime(blackout.start_time)} — ${formatTime(blackout.end_time)}`
                    : " · butun kun"}
                </p>
                {blackout.reason && (
                  <p className="text-muted-foreground">{blackout.reason}</p>
                )}
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="O'chirish"
                onClick={() => setToDelete(blackout.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Yopiq vaqtni o'chirasizmi?"
        description="Bu vaqt yana bron qilish uchun ochiladi."
        confirmLabel="O'chirish"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </Card>
  );
}
