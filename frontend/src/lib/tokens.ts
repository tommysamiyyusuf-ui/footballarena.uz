import type { Tokens } from "@/types/api";

const ACCESS_KEY = "arena.access";
const REFRESH_KEY = "arena.refresh";

/**
 * JWTs live in localStorage so a refresh survives a page reload. Nothing else
 * about the user is cached here — the profile is always re-fetched from
 * `/api/users/me/`, so a blocked or demoted account cannot keep stale rights.
 */
export const tokenStore = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  save(tokens: Tokens) {
    localStorage.setItem(ACCESS_KEY, tokens.access);
    localStorage.setItem(REFRESH_KEY, tokens.refresh);
  },
  setAccess(access: string) {
    localStorage.setItem(ACCESS_KEY, access);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Reads the `role` claim without verifying it — for routing hints only. */
export function decodeRole(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}
