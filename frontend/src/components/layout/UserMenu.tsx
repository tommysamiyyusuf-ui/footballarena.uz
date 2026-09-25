import { ChevronDown, LayoutDashboard, LogOut, MessageSquare, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhone, initials } from "@/lib/format";
import { HOME_BY_ROLE, useAuthStore } from "@/stores/auth";

const ROLE_LABEL = {
  ADMIN: "Administrator",
  OWNER: "Arendator",
  USER: "Mijoz",
};

export function UserMenu() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  if (!user) return null;

  const profilePath =
    user.role === "ADMIN" ? "/admin/settings" : user.role === "OWNER" ? "/owner/profile" : "/profile";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 outline-none ring-offset-background transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:pr-2.5">
        <Avatar className="h-9 w-9">
          {user.avatar && <AvatarImage src={user.avatar} alt={user.full_name} />}
          <AvatarFallback>{initials(user.full_name || user.username)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[9rem] truncate text-sm font-medium sm:inline">
          {user.full_name || user.username}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate">{user.full_name || user.username}</p>
          <p className="text-xs font-normal text-muted-foreground">
            {user.phone ? formatPhone(user.phone) : user.email}
          </p>
          <p className="text-xs font-normal text-primary">{ROLE_LABEL[user.role]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate(HOME_BY_ROLE[user.role])}>
          <LayoutDashboard className="h-4 w-4" />
          {user.role === "USER" ? "Bosh sahifa" : "Panel"}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => navigate(profilePath)}>
          <User className="h-4 w-4" />
          Profil
        </DropdownMenuItem>

        {user.role !== "ADMIN" && (
          <DropdownMenuItem
            onClick={() => navigate(user.role === "OWNER" ? "/owner/chat" : "/chat")}
          >
            <MessageSquare className="h-4 w-4" />
            Xabarlar
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onClick={async () => {
            await signOut();
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="h-4 w-4" />
          Chiqish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
