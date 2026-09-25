import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { PageLoader } from "@/components/shared/States";
import { HOME_BY_ROLE, useAuthStore } from "@/stores/auth";
import type { Role } from "@/types/api";

/**
 * Role isolation, enforced client-side purely for navigation comfort — the API
 * rejects out-of-role requests on its own, so a tampered bundle gains nothing.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) return <PageLoader className="min-h-screen" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  return <>{children}</>;
}

/** Keeps a signed-in user away from `/login`. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthStore();

  if (loading) return <PageLoader className="min-h-screen" />;
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  return <>{children}</>;
}
