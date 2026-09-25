import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { tokenStore } from "@/lib/tokens";
import { useAuthStore } from "@/stores/auth";
import type { AppNotification } from "@/types/api";

function socketUrl(path: string, token: string): string {
  const base = import.meta.env.VITE_WS_URL;
  if (base) return `${base}${path}?token=${encodeURIComponent(token)}`;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws${path}?token=${encodeURIComponent(token)}`;
}

export function buildSocketUrl(path: string): string | null {
  const token = tokenStore.access();
  return token ? socketUrl(path, token) : null;
}

/**
 * Live notification feed. Reconnects with a capped backoff so a backend restart
 * does not leave the tab permanently silent, and never retries once signed out.
 */
export function useNotificationSocket() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<number>();

  useEffect(() => {
    if (!user) return;

    let closedByUs = false;

    const connect = () => {
      const url = buildSocketUrl("/notifications/");
      if (!url) return;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type: string;
            data?: AppNotification;
          };
          if (parsed.type !== "notification" || !parsed.data) return;

          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
          // A booking decision changes the lists the user is probably looking at.
          queryClient.invalidateQueries({ queryKey: ["bookings"] });
          toast(parsed.data.title, { description: parsed.data.message });
        } catch {
          // Ignore malformed frames rather than tearing the socket down.
        }
      };

      socket.onclose = () => {
        if (closedByUs) return;
        attemptRef.current += 1;
        const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);
        timerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByUs = true;
      window.clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user, queryClient]);
}
