import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { favoritesApi } from "@/api/misc";
import { errorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

/**
 * Toggles a favorite and refreshes every list that could show the heart.
 * Anonymous visitors are sent to the login page instead of a silent 401.
 */
export function useFavoriteToggle() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const mutation = useMutation({
    mutationFn: (stadiumId: string) => favoritesApi.toggle(stadiumId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stadiums"] });
      queryClient.invalidateQueries({ queryKey: ["stadium"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(data.is_favorite ? "Sevimlilarga qo'shildi" : "Sevimlilardan olindi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return {
    ...mutation,
    toggle: (stadiumId: string) => {
      if (!user) {
        navigate("/login", { state: { from: window.location.pathname } });
        return;
      }
      if (user.role !== "USER") {
        toast.info("Sevimlilar faqat mijozlar uchun.");
        return;
      }
      mutation.mutate(stadiumId);
    },
  };
}
