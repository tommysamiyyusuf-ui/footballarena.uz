import { Menu, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { UserMenu } from "@/components/layout/UserMenu";
import { cn } from "@/lib/utils";

export interface PanelNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only these appear in the mobile tab bar — space is limited to five. */
  primary?: boolean;
  end?: boolean;
}

interface PanelShellProps {
  title: string;
  items: PanelNavItem[];
}

/**
 * Sidebar shell shared by the owner and admin panels: a fixed sidebar on
 * desktop, a slide-over drawer plus a bottom tab bar on mobile.
 */
export function PanelShell({ title, items }: PanelShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const tabs = items.filter((item) => item.primary).slice(0, 5);

  // A drawer left open across a navigation would cover the new page.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const links = (
    <nav className="flex flex-col gap-1 p-3">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/80 bg-card lg:flex">
        <Link to="/" className="flex h-16 items-center gap-2 border-b border-border/80 px-5">
          <img src="/logo.png" alt="Football Arena" className="h-10 w-auto object-contain" />
        </Link>
        <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className="flex-1 overflow-y-auto pt-2">{links}</div>
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Menyuni yopish"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-border/80 px-4">
              <img src="/logo.png" alt="Football Arena" className="h-9 w-auto object-contain" />
              <button
                type="button"
                aria-label="Yopish"
                className="rounded-full p-2 hover:bg-accent"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <div className="flex-1 overflow-y-auto pt-2">{links}</div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              aria-label="Menyu"
              className="rounded-full p-2 hover:bg-accent lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold lg:hidden">{title}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 pb-24 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur safe-bottom lg:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
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
