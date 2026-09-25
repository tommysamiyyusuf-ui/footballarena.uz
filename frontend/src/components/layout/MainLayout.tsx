import { CalendarCheck, Heart, Home, MessageSquare, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { UserMenu } from "@/components/layout/UserMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Anonymous visitors only get the catalogue. */
  authOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Asosiy", icon: Home },
  { to: "/bookings", label: "Bronlarim", icon: CalendarCheck, authOnly: true },
  { to: "/favorites", label: "Sevimli", icon: Heart, authOnly: true },
  { to: "/chat", label: "Xabarlar", icon: MessageSquare, authOnly: true },
];

/** Bottom tab bar mirrors the mobile mock exactly: 4 slots, profile instead of chat. */
const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "Asosiy", icon: Home },
  { to: "/favorites", label: "Sevimlilar", icon: Heart, authOnly: true },
  { to: "/bookings", label: "Bronlarim", icon: CalendarCheck, authOnly: true },
  { to: "/profile", label: "Profil", icon: User, authOnly: true },
];

export function MainLayout() {
  const user = useAuthStore((state) => state.user);
  const items = NAV.filter((item) => !item.authOnly || user);
  const mobileItems = MOBILE_NAV.filter((item) => !item.authOnly || user);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center gap-4">
          <Link to="/" className="flex shrink-0 items-center">
            <img src="/logo.png" alt="Football Arena" className="h-12 w-auto object-contain" />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {user ? (
              <>
                <NotificationBell />
                <UserMenu />
              </>
            ) : (
              <Button asChild size="sm" className="rounded-full">
                <Link to="/login">Kirish</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-10">
        <Outlet />
      </main>

      <footer className="hidden border-t py-6 md:block">
        <div className="container flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Football Arena — stadion bron qilish platformasi</p>
          <p>O'zbekiston</p>
        </div>
      </footer>

      {/* Mobile tab bar. Hidden on desktop where the header nav takes over. */}
      {mobileItems.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur safe-bottom md:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, 1fr)` }}>
            {mobileItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
