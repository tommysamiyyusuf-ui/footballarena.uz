import { useQuery } from "@tanstack/react-query";
import {
  Car,
  CircleDot,
  Coffee,
  DoorOpen,
  List,
  Loader2,
  Lightbulb,
  Lock,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  ShowerHead,
  SlidersHorizontal,
  Users,
  Wifi,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { stadiumsApi, type StadiumQuery } from "@/api/stadiums";
import { StadiumMap } from "@/components/map/StadiumMap";
import { Pagination } from "@/components/shared/Pagination";
import { Rating } from "@/components/shared/Rating";
import { StadiumCard, StadiumCardSkeleton } from "@/components/shared/StadiumCard";
import { EmptyState, ErrorState } from "@/components/shared/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/useDebounce";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  DEFAULT_CENTER,
  FIELD_TYPES,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  RATING_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/constants";
import { formatDistance, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StadiumListItem } from "@/types/api";

const PAGE_SIZE = 12;
/** Radix Select cannot hold an empty string, so "any" stands in for "no filter". */
const ANY = "any";

const AMENITY_ICONS: Record<string, LucideIcon> = {
  parking: Car,
  shower: ShowerHead,
  locker: Lock,
  lighting: Lightbulb,
  wifi: Wifi,
  cafe: Coffee,
  tribune: Users,
  ball: CircleDot,
  wc: DoorOpen,
  security: ShieldCheck,
};

interface Filters {
  city: string;
  district: string;
  field_type: string;
  max_price: string;
  min_rating: string;
  radius: string;
  ordering: string;
  amenities: string[];
}

function readFilters(params: URLSearchParams): Filters {
  const amenities = params.get("amenities");
  return {
    city: params.get("city") ?? "",
    district: params.get("district") ?? "",
    field_type: params.get("field_type") ?? "",
    max_price: params.get("max_price") ?? "",
    min_rating: params.get("min_rating") ?? "",
    radius: params.get("radius") ?? "",
    ordering: params.get("ordering") ?? "",
    amenities: amenities ? amenities.split(",").filter(Boolean) : [],
  };
}

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeStadium, setActiveStadium] = useState<StadiumListItem | null>(null);

  const search = useDebounce(searchInput, 400);
  const filters = useMemo(() => readFilters(params), [params]);
  const page = Number(params.get("page") ?? 1);

  const { coords, status: geoStatus, request: requestLocation } = useGeolocation();

  // The debounced term is what actually reaches the URL, so typing does not
  // create a history entry per keystroke.
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (search) next.set("search", search);
        else next.delete("search");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [search, setParams]);

  const patch = (changes: Partial<Filters>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(changes)) {
        const serialised = Array.isArray(value) ? value.join(",") : value;
        if (serialised) next.set(key, serialised);
        else next.delete(key);
      }
      // Changing city invalidates the district picked under the old city.
      if (changes.city !== undefined) next.delete("district");
      next.delete("page");
      return next;
    });
  };

  const clearAll = () => {
    setSearchInput("");
    setParams(new URLSearchParams());
  };

  const query: StadiumQuery = {
    search: search || undefined,
    city: filters.city || undefined,
    district: filters.district || undefined,
    field_type: filters.field_type || undefined,
    max_price: filters.max_price || undefined,
    min_rating: filters.min_rating || undefined,
    amenities: filters.amenities.length ? filters.amenities.join(",") : undefined,
    ordering: filters.ordering || undefined,
    page,
    page_size: PAGE_SIZE,
    // Coordinates unlock both distance badges and nearest-first ordering.
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    ...(coords && filters.radius ? { radius: filters.radius } : {}),
  };

  const stadiums = useQuery({
    queryKey: ["stadiums", query],
    queryFn: () => stadiumsApi.list(query),
    placeholderData: (previous) => previous,
  });

  const amenities = useQuery({
    queryKey: ["amenities"],
    queryFn: stadiumsApi.amenities,
    staleTime: 60 * 60 * 1000,
  });

  const cities = useQuery({
    queryKey: ["cities"],
    queryFn: stadiumsApi.cities,
    staleTime: 60 * 60 * 1000,
  });

  const districts = cities.data?.find((entry) => entry.city === filters.city)?.districts ?? [];

  const activeCount =
    (filters.city ? 1 : 0) +
    (filters.district ? 1 : 0) +
    (filters.field_type ? 1 : 0) +
    (filters.max_price ? 1 : 0) +
    (filters.min_rating ? 1 : 0) +
    (filters.radius ? 1 : 0) +
    filters.amenities.length;

  const results = stadiums.data?.results ?? [];

  const filterControls = (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shahar">
          <Select
            value={filters.city || ANY}
            onValueChange={(value) => patch({ city: value === ANY ? "" : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Barchasi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Barcha shaharlar</SelectItem>
              {cities.data?.map((entry) => (
                <SelectItem key={entry.city} value={entry.city}>
                  {entry.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Tuman">
          <Select
            value={filters.district || ANY}
            disabled={!filters.city}
            onValueChange={(value) => patch({ district: value === ANY ? "" : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={filters.city ? "Barchasi" : "Avval shaharni tanlang"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Barcha tumanlar</SelectItem>
              {districts.map((district) => (
                <SelectItem key={district} value={district}>
                  {district}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <PillField label="Masofa" disabled={!coords} hint={!coords ? "Joylashuvni yoqing" : undefined}>
        {RADIUS_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            active={filters.radius === option.value}
            disabled={!coords}
            onClick={() => patch({ radius: filters.radius === option.value ? "" : option.value })}
          >
            {option.label}
          </Pill>
        ))}
      </PillField>

      <PillField label="Narx (soatiga)">
        {PRICE_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            active={filters.max_price === option.value}
            onClick={() => patch({ max_price: filters.max_price === option.value ? "" : option.value })}
          >
            {option.label}
          </Pill>
        ))}
      </PillField>

      <PillField label="Reyting">
        {RATING_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            active={filters.min_rating === option.value}
            onClick={() => patch({ min_rating: filters.min_rating === option.value ? "" : option.value })}
          >
            {option.label}
          </Pill>
        ))}
      </PillField>

      <PillField label="Maydon turi">
        {FIELD_TYPES.map((option) => (
          <Pill
            key={option.value}
            active={filters.field_type === option.value}
            onClick={() => patch({ field_type: filters.field_type === option.value ? "" : option.value })}
          >
            {option.label}
          </Pill>
        ))}
      </PillField>

      {!!amenities.data?.length && (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Qo'shimcha xizmatlar</p>
          <div className="grid grid-cols-3 gap-2">
            {amenities.data.map((amenity) => {
              const checked = filters.amenities.includes(amenity.code);
              const Icon = AMENITY_ICONS[amenity.code] ?? CircleDot;
              return (
                <button
                  key={amenity.id}
                  type="button"
                  onClick={() =>
                    patch({
                      amenities: checked
                        ? filters.amenities.filter((code) => code !== amenity.code)
                        : [...filters.amenities, amenity.code],
                    })
                  }
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors",
                    checked
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="line-clamp-2 leading-tight">
                    {amenity.name_uz || amenity.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <Button variant="ghost" className="w-full" onClick={clearAll}>
          <X className="h-4 w-4" />
          Filtrni tozalash
        </Button>
      )}

      <Button className="w-full" size="lg" onClick={() => setFiltersOpen(false)}>
        Qidirish {stadiums.data ? `(${stadiums.data.count})` : ""}
      </Button>
    </div>
  );

  return (
    <div className="container space-y-6 py-6">
      <h1 className="sr-only">Stadion toping</h1>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Stadion, hudud yoki manzilni qidirish..."
              className="rounded-full pl-9"
            />
            {searchInput !== search && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <Button
            variant={coords ? "secondary" : "outline"}
            onClick={requestLocation}
            loading={geoStatus === "loading"}
            title={
              geoStatus === "denied"
                ? "Brauzer joylashuvga ruxsat bermadi"
                : "Joylashuvni aniqlash"
            }
          >
            <Navigation className="h-4 w-4" />
            <span className="hidden sm:inline">
              {coords ? "Yaqinimdagilar" : "Joylashuvim"}
            </span>
          </Button>

          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtr
            {activeCount > 0 && <Badge className="ml-1">{activeCount}</Badge>}
          </Button>

          <div className="hidden w-48 sm:block">
            <Select
              value={filters.ordering || ANY}
              onValueChange={(value) => patch({ ordering: value === ANY ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Saralash" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value || ANY} value={option.value || ANY}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex rounded-lg border p-0.5 lg:hidden">
            <ViewToggle active={view === "list"} onClick={() => setView("list")} icon={List} label="Ro'yxat" />
            <ViewToggle active={view === "map"} onClick={() => setView("map")} icon={MapPin} label="Xarita" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border bg-card p-5">
            {filterControls}
          </div>
        </aside>

        <div className="space-y-6">
          <div className={cn("relative lg:block", view === "map" ? "block" : "hidden")}>
            <StadiumMap
              stadiums={results}
              userLocation={coords}
              center={coords ?? DEFAULT_CENTER}
              activeId={activeStadium?.id ?? null}
              onMarkerClick={setActiveStadium}
              className="h-[420px] w-full overflow-hidden rounded-2xl border lg:h-[360px]"
            />

            {activeStadium && (
              <div className="absolute bottom-3 left-3 right-3 z-10 max-w-sm overflow-hidden rounded-xl border bg-card shadow-lg sm:right-auto">
                <button
                  type="button"
                  aria-label="Yopish"
                  onClick={() => setActiveStadium(null)}
                  className="absolute right-2 top-2 z-10 rounded-full bg-background/90 p-1 hover:bg-background"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex gap-3 p-3">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {activeStadium.cover_image ? (
                      <img
                        src={activeStadium.cover_image}
                        alt={activeStadium.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-semibold">{activeStadium.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {activeStadium.district ? `${activeStadium.district}, ` : ""}
                      {activeStadium.city}
                      {activeStadium.distance_km !== null && activeStadium.distance_km !== undefined && (
                        <span className="ml-1 text-primary">
                          · {formatDistance(activeStadium.distance_km)}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center justify-between pt-0.5">
                      <p className="text-sm font-bold text-primary">
                        {formatMoney(activeStadium.price_per_hour)}{" "}
                        <span className="text-xs font-medium text-muted-foreground">so'm</span>
                      </p>
                      <Rating value={activeStadium.rating} count={activeStadium.review_count} />
                    </div>
                  </div>
                </div>
                <Button asChild size="sm" className="w-full rounded-none">
                  <Link to={`/stadiums/${activeStadium.id}`}>Batafsil</Link>
                </Button>
              </div>
            )}
          </div>

          <div className={cn("space-y-6 lg:block", view === "map" ? "hidden" : "block")}>
            {stadiums.isError ? (
              <ErrorState
                message="Stadionlarni yuklab bo'lmadi."
                onRetry={() => void stadiums.refetch()}
              />
            ) : stadiums.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <StadiumCardSkeleton key={index} />
                ))}
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                title="Stadion topilmadi"
                description="Qidiruv shartlarini yoki filtrlarni o'zgartirib ko'ring."
                action={
                  activeCount > 0 ? (
                    <Button variant="outline" onClick={clearAll}>
                      Filtrlarni tozalash
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-bold sm:text-xl">
                    {coords ? "Sizga yaqin stadionlar" : "Barcha stadionlar"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {stadiums.data?.count} ta topildi
                  </p>
                </div>
                <div
                  className={cn(
                    "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
                    stadiums.isFetching && "opacity-60",
                  )}
                >
                  {results.map((stadium) => (
                    <StadiumCard key={stadium.id} stadium={stadium} />
                  ))}
                </div>
                <Pagination
                  page={page}
                  count={stadiums.data?.count ?? 0}
                  pageSize={PAGE_SIZE}
                  onChange={(next) =>
                    setParams((prev) => {
                      const updated = new URLSearchParams(prev);
                      updated.set("page", String(next));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return updated;
                    })
                  }
                />
              </>
            )}
          </div>
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Yopish"
            className="absolute inset-0 bg-black/50"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filtrlar</h2>
              <button
                type="button"
                aria-label="Yopish"
                className="rounded-lg p-2 hover:bg-accent"
                onClick={() => setFiltersOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {filterControls}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PillField({
  label,
  hint,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60")}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary/40 text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof List;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
