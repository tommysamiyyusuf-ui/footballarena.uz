import { useCallback, useEffect, useState } from "react";

export interface Coords {
  lat: number;
  lng: number;
}

const STORAGE_KEY = "arena.coords";

function readCached(): Coords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Coords;
    return typeof parsed.lat === "number" && typeof parsed.lng === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Browser geolocation with the last known position cached, so a returning
 * visitor sees nearby stadiums before the permission prompt is answered.
 */
export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(readCached);
  const [status, setStatus] = useState<"idle" | "loading" | "granted" | "denied">(
    readCached() ? "granted" : "idle",
  );

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("denied");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCoords(next);
        setStatus("granted");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      () => setStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    if (!("permissions" in navigator)) return;
    // Only auto-request when permission was already granted in a past visit;
    // otherwise the prompt would appear before the user asked for anything.
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (result.state === "granted") request();
      })
      .catch(() => undefined);
  }, [request]);

  return { coords, status, request, clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    setCoords(null);
    setStatus("idle");
  } };
}
