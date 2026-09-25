import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

import { tokenStore } from "@/lib/tokens";
import type { ApiError, SlotSuggestion, Tokens } from "@/types/api";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * ngrok's free tunnels answer ordinary browser requests with an HTML
 * interstitial instead of proxying them, so every XHR comes back as
 * unparseable HTML — `/config/` fails and the login page silently drops its
 * social buttons. Any value for this header skips the interstitial.
 *
 * Dev only: in production the API is a different origin, and a custom header
 * there would force a CORS preflight that the backend does not allow.
 */
const TUNNEL_HEADERS: Record<string, string> = import.meta.env.DEV
  ? { "ngrok-skip-browser-warning": "true" }
  : {};

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { Accept: "application/json", ...TUNNEL_HEADERS },
});

api.interceptors.request.use((config) => {
  const access = tokenStore.access();
  if (access && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

/**
 * A single in-flight refresh shared by every 401'd request. Without this, ten
 * parallel queries on a stale token would fire ten refreshes and nine of them
 * would fail against the rotation blacklist.
 */
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const refresh = tokenStore.refresh();
  if (!refresh) return Promise.reject(new Error("no refresh token"));

  refreshPromise = axios
    .post<Tokens>(
      `${BASE_URL}/auth/token/refresh/`,
      { refresh },
      { headers: TUNNEL_HEADERS },
    )
    .then(({ data }) => {
      // Rotation is on, so the response carries a fresh refresh token too.
      if (data.refresh) tokenStore.save(data);
      else tokenStore.setAccess(data.access);
      return data.access;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    const isRefreshCall = config?.url?.includes("/auth/token/refresh/");
    if (status === 401 && config && !config._retried && !isRefreshCall) {
      config._retried = true;
      try {
        const access = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${access}`;
        return api.request(config);
      } catch {
        tokenStore.clear();
        // Let the auth store react rather than hard-navigating from here.
        window.dispatchEvent(new CustomEvent("arena:unauthorized"));
      }
    }
    return Promise.reject(error);
  },
);

const FALLBACK_MESSAGE = "Nimadir noto'g'ri ketdi. Qaytadan urinib ko'ring.";

/** Normalises anything thrown by axios into the backend's error envelope. */
export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Partial<ApiError> | undefined;
    if (data && typeof data.message === "string") {
      return {
        success: false,
        code: data.code ?? "error",
        message: data.message,
        errors: data.errors ?? {},
        alternatives: data.alternatives,
      };
    }
    if (error.code === "ECONNABORTED") {
      return {
        success: false,
        code: "timeout",
        message: "So'rov juda uzoq davom etdi. Internetni tekshiring.",
        errors: {},
      };
    }
    if (!error.response) {
      return {
        success: false,
        code: "network",
        message: "Serverga ulanib bo'lmadi. Internetni tekshiring.",
        errors: {},
      };
    }
  }
  return { success: false, code: "error", message: FALLBACK_MESSAGE, errors: {} };
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}

/** 409 from `/bookings/create_booking/` carries suggested free slots. */
export function slotAlternatives(error: unknown): SlotSuggestion[] {
  return toApiError(error).alternatives ?? [];
}

/**
 * Maps DRF field errors onto react-hook-form so each input shows its own
 * message instead of a single toast for the whole form.
 */
export function applyFieldErrors(
  error: unknown,
  setError: (field: string, options: { type: string; message: string }) => void,
  known: string[],
): boolean {
  const { errors } = toApiError(error);
  let applied = false;
  for (const [field, value] of Object.entries(errors ?? {})) {
    if (!known.includes(field)) continue;
    const message = Array.isArray(value) ? value[0] : String(value);
    setError(field, { type: "server", message });
    applied = true;
  }
  return applied;
}
