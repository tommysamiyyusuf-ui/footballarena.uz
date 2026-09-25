import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { useConfig } from "@/hooks/useConfig";
import { useYandexMaps } from "@/hooks/useYandexMaps";
import { DEFAULT_CENTER } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StadiumListItem } from "@/types/api";

interface StadiumMapProps {
  stadiums: StadiumListItem[];
  center?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number } | null;
  zoom?: number;
  className?: string;
  activeId?: string | null;
  onMarkerClick?: (stadium: StadiumListItem) => void;
}

/**
 * Read-only catalogue map. Markers are rebuilt whenever the stadium list
 * changes; the map instance itself is created once and reused so panning does
 * not reset on every filter keystroke.
 */
export function StadiumMap({
  stadiums,
  center,
  userLocation,
  zoom = 12,
  className,
  activeId,
  onMarkerClick,
}: StadiumMapProps) {
  const { data: config } = useConfig();
  const status = useYandexMaps(config?.maps.yandex_api_key);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const collectionRef = useRef<any>(null);
  const clickRef = useRef(onMarkerClick);
  clickRef.current = onMarkerClick;

  useEffect(() => {
    if (status !== "ready" || !containerRef.current || mapRef.current) return;

    const start = center ?? userLocation ?? DEFAULT_CENTER;
    mapRef.current = new window.ymaps.Map(
      containerRef.current,
      { center: [start.lat, start.lng], zoom, controls: ["zoomControl", "geolocationControl"] },
      { suppressMapOpenBlock: true },
    );

    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
      collectionRef.current = null;
    };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Markers.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    if (collectionRef.current) map.geoObjects.remove(collectionRef.current);
    const collection = new window.ymaps.GeoObjectCollection(null, {
      preset: "islands#greenSportIcon",
    });

    for (const stadium of stadiums) {
      const placemark = new window.ymaps.Placemark(
        [stadium.latitude, stadium.longitude],
        {
          balloonContentHeader: stadium.name,
          balloonContentBody: `${stadium.district ? `${stadium.district}, ` : ""}${stadium.city}<br/><b>${formatMoney(stadium.price_per_hour)} so'm/soat</b>`,
          hintContent: stadium.name,
        },
        {
          preset:
            stadium.id === activeId
              ? "islands#redSportIcon"
              : "islands#greenSportIcon",
        },
      );
      placemark.events.add("click", () => clickRef.current?.(stadium));
      collection.add(placemark);
    }

    if (userLocation) {
      collection.add(
        new window.ymaps.Placemark(
          [userLocation.lat, userLocation.lng],
          { hintContent: "Siz shu yerdasiz" },
          { preset: "islands#blueCircleDotIcon" },
        ),
      );
    }

    map.geoObjects.add(collection);
    collectionRef.current = collection;

    if (stadiums.length > 1) {
      map.setBounds(collection.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
    } else if (stadiums.length === 1) {
      map.setCenter([stadiums[0].latitude, stadiums[0].longitude], 15);
    }
  }, [status, stadiums, activeId, userLocation]);

  // Recentre when the caller moves the viewport (e.g. geolocation resolves).
  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !center) return;
    mapRef.current.setCenter([center.lat, center.lng], zoom);
  }, [status, center, zoom]);

  if (status === "error") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border bg-muted/40 p-6 text-center",
          className,
        )}
      >
        <AlertTriangle className="h-6 w-6 text-warning" />
        <p className="text-sm text-muted-foreground">
          Xaritani yuklab bo'lmadi. Ro'yxat ko'rinishidan foydalaning.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-muted/40", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
