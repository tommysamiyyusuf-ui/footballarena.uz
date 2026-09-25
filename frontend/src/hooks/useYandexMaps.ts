import { useEffect, useState } from "react";

declare global {
  interface Window {
    // The Yandex API has no official typings; we only touch a handful of calls.
    ymaps?: any;
  }
}

type Status = "idle" | "loading" | "ready" | "error";

const SCRIPT_ID = "yandex-maps-api";
let loader: Promise<void> | null = null;

/**
 * Injects the Yandex Maps script once per page and resolves when `ymaps.ready`
 * fires. The API key is public by design (domain-restricted in the Yandex
 * console) and is served by `/api/config/` rather than baked into the bundle.
 */
function loadScript(apiKey: string): Promise<void> {
  if (window.ymaps?.Map) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    if (!existing) {
      script.id = SCRIPT_ID;
      script.async = true;
      const key = apiKey ? `apikey=${encodeURIComponent(apiKey)}&` : "";
      script.src = `https://api-maps.yandex.ru/2.1/?${key}lang=ru_RU`;
      document.head.appendChild(script);
    }

    script.addEventListener("load", () => window.ymaps.ready(() => resolve()));
    script.addEventListener("error", () => {
      loader = null;
      reject(new Error("Yandex Maps yuklanmadi"));
    });
  });

  return loader;
}

export function useYandexMaps(apiKey: string | undefined) {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (apiKey === undefined) return;
    let cancelled = false;
    setStatus("loading");
    loadScript(apiKey)
      .then(() => !cancelled && setStatus("ready"))
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return status;
}
