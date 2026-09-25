import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { HOME_BY_ROLE, useAuthStore } from "@/stores/auth";

export function NotFoundPage() {
  const user = useAuthStore((state) => state.user);
  const home = user ? HOME_BY_ROLE[user.role] : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">Sahifa topilmadi</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Siz izlagan sahifa o'chirilgan yoki manzil noto'g'ri kiritilgan bo'lishi mumkin.
      </p>
      <Button asChild>
        <Link to={home}>Bosh sahifaga qaytish</Link>
      </Button>
    </div>
  );
}
