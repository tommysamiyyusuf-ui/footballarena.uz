import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Star,
  User,
} from "lucide-react";

import { PanelShell, type PanelNavItem } from "@/components/layout/PanelShell";

const ITEMS: PanelNavItem[] = [
  { to: "/owner", label: "Boshqaruv", icon: LayoutDashboard, primary: true, end: true },
  { to: "/owner/stadiums", label: "Stadionlarim", icon: MapPin, primary: true },
  { to: "/owner/bookings", label: "Bronlar", icon: CalendarDays, primary: true },
  { to: "/owner/calendar", label: "Kalendar", icon: CalendarRange },
  { to: "/owner/statistics", label: "Statistika", icon: BarChart3, primary: true },
  { to: "/owner/reviews", label: "Sharhlar", icon: Star },
  { to: "/owner/chat", label: "Xabarlar", icon: MessageSquare, primary: true },
  { to: "/owner/profile", label: "Profil", icon: User },
];

export function OwnerLayout() {
  return <PanelShell title="Arendator paneli" items={ITEMS} />;
}
