import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Settings,
  Star,
  Users,
  Wallet,
} from "lucide-react";

import { PanelShell, type PanelNavItem } from "@/components/layout/PanelShell";

const ITEMS: PanelNavItem[] = [
  { to: "/admin", label: "Boshqaruv", icon: LayoutDashboard, primary: true, end: true },
  { to: "/admin/moderation", label: "Moderatsiya", icon: ClipboardList, primary: true },
  { to: "/admin/stadiums", label: "Stadionlar", icon: MapPin, primary: true },
  { to: "/admin/owners", label: "Arendatorlar", icon: Users },
  { to: "/admin/users", label: "Foydalanuvchilar", icon: Users, primary: true },
  { to: "/admin/bookings", label: "Bronlar", icon: CalendarDays },
  { to: "/admin/reviews", label: "Sharhlar", icon: Star },
  { to: "/admin/finance", label: "Moliya", icon: Wallet, primary: true },
  { to: "/admin/statistics", label: "Statistika", icon: BarChart3 },
  { to: "/admin/audit", label: "Audit jurnali", icon: ScrollText },
  { to: "/admin/settings", label: "Sozlamalar", icon: Settings },
];

export function AdminLayout() {
  return <PanelShell title="Admin panel" items={ITEMS} />;
}
