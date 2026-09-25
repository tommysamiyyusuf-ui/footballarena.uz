import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { PublicConfig } from "@/types/api";

/**
 * Platform configuration served by `/api/config/`. Which social logins are
 * enabled, the Yandex key and the booking limits all come from the backend so
 * the bundle never has to be rebuilt to change them.
 */
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => (await api.get<PublicConfig>("/config/")).data,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
