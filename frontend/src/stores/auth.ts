import { create } from "zustand";

import { api } from "@/lib/api";
import { tokenStore } from "@/lib/tokens";
import type { Me, Role, Tokens } from "@/types/api";

interface AuthState {
  user: Me | null;
  /** `true` until the first `/users/me/` probe settles. Guards the router. */
  loading: boolean;
  signIn: (tokens: Tokens, user: Me) => void;
  signOut: (options?: { revoke?: boolean }) => Promise<void>;
  /** Re-reads the profile from the API — the only source of truth for role. */
  refreshUser: () => Promise<Me | null>;
  setUser: (user: Me) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  signIn: (tokens, user) => {
    tokenStore.save(tokens);
    set({ user, loading: false });
  },

  signOut: async ({ revoke = true } = {}) => {
    const refresh = tokenStore.refresh();
    if (revoke && refresh) {
      // Blacklists the refresh token server-side. A failure here (expired
      // token, offline) must not stop the user from leaving the session.
      await api.post("/auth/logout/", { refresh }).catch(() => undefined);
    }
    tokenStore.clear();
    set({ user: null, loading: false });
  },

  refreshUser: async () => {
    if (!tokenStore.access()) {
      set({ user: null, loading: false });
      return null;
    }
    try {
      const { data } = await api.get<Me>("/users/me/");
      set({ user: data, loading: false });
      return data;
    } catch {
      tokenStore.clear();
      set({ user: null, loading: false });
      return null;
    }
  },

  setUser: (user) => set({ user }),
}));

/** Where each role lands after a successful sign-in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin",
  OWNER: "/owner",
  USER: "/",
};

// The axios interceptor fires this once a refresh attempt fails for good.
window.addEventListener("arena:unauthorized", () => {
  useAuthStore.setState({ user: null, loading: false });
});
