import { AlertTriangle, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef } from "react";

import { useConfig } from "@/hooks/useConfig";
import { useYandexMaps } from "@/hooks/useYandexMaps";
import { DEFAULT_CENTER } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (coords: { lat: number; lng: number; address?: string }) => void;
  className?: string;
}

/**
 * Click-to-place marker used by the owner's stadium form. Reverse geocoding is
 * best-effort: if Yandex returns an address we hand it back so the form can
 * pre-fill the address field, but the coordinates are what actually matter.
 */
export function LocationPicker({
  latitude,
  longitude,
  onChange,
  className,
}: LocationPickerProps) {
  const { data: config } = useConfig();
  const status = useYandexMaps(config?.maps.yandex_api_key);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    if (status !== "ready" || !containerRef.current || mapRef.current) return;

    const start =
      latitude && longitude ? { lat: latitude, lng: longitude } : DEFAULT_CENTER;

    const map = new window.ymaps.Map(
      containerRef.current,
      { center: [start.lat, start.lng], zoom: latitude ? 16 : 12, controls: ["zoomControl", "searchControl", "geolocationControl"] },
      { suppressMapOpenBlock: true },
    );
    mapRef.current = map;

    const place = (coords: number[]) => {
      if (markerRef.current) {
        markerRef.current.geometry.setCoordinates(coords);
      } else {
        const marker = new window.ymaps.Placemark(
          coords,
          {},
          { preset: "islands#redSportIcon", draggable: true },
        );
        marker.events.add("dragend", () => {
          const dragged = marker.geometry.getCoordinates();
          resolve(dragged);
        });
        map.geoObjects.add(marker);
        markerRef.current = marker;
      }
    };

    const resolve = (coords: number[]) => {
      window.ymaps
        .geocode(coords)
        .then((result: any) => {
          const first = result.geoObjects.get(0);
          changeRef.current({
            lat: coords[0],
            lng: coords[1],
            address: first ? first.getAddressLine() : undefined,
          });
        })
        .catch(() => changeRef.current({ lat: coords[0], lng: coords[1] }));
    };

    map.events.add("click", (event: any) => {
      const coords = event.get("coords");
      place(coords);
      resolve(coords);
    });

    if (latitude && longitude) place([latitude, longitude]);

    return () => {
      map.destroy();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the marker in sync when the parent form sets coordinates itself.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !latitude || !longitude) return;
    const coords = [latitude, longitude];
    if (markerRef.current) {
      markerRef.current.geometry.setCoordinates(coords);
    } else {
      const marker = new window.ymaps.Placemark(coords, {}, { preset: "islands#redSportIcon" });
      mapRef.current.geoObjects.add(marker);
      markerRef.current = marker;
    }
  }, [status, latitude, longitude]);

  if (status === "error") {
    return (
      <div className={cn("flex items-center gap-2 rounded-xl border bg-muted/40 p-4", className)}>
        <AlertTriangle className="h-5 w-5 text-warning" />
        <p className="text-sm text-muted-foreground">
          Xarita ochilmadi — koordinatalarni qo'lda kiriting.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl border", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs shadow">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          Joyni belgilash uchun xaritani bosing
        </div>
      )}
    </div>
  );
}
