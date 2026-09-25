import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, LogOut } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { authApi } from "@/api/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api";
import { formatPhone, initials } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import type { UserProfile } from "@/types/api";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, setUser, signOut } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [city, setCity] = useState(user?.profile?.city ?? "");
  const [district, setDistrict] = useState(user?.profile?.district ?? "");

  const save = useMutation({
    mutationFn: (profile?: Partial<UserProfile>) =>
      authApi.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        profile: { city: city.trim(), district: district.trim(), ...profile },
      }),
    onSuccess: (data) => {
      setUser(data);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Profil yangilandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => authApi.updateAvatar(file),
    onSuccess: (data) => {
      setUser(data);
      toast.success("Rasm yangilandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!user) return null;

  const notifications = user.profile;

  return (
    <div className="container max-w-2xl space-y-6 py-6">
      <h1 className="text-2xl font-bold">Profil</h1>

      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <div className="relative">
            <Avatar className="h-20 w-20">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.full_name} />}
              <AvatarFallback className="text-xl">
                {initials(user.full_name || user.username)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              aria-label="Rasmni almashtirish"
              disabled={uploadAvatar.isPending}
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border/80 bg-background shadow-sm hover:bg-accent"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > MAX_AVATAR_BYTES) {
                  toast.error("Rasm hajmi 5 MB dan oshmasligi kerak.");
                  return;
                }
                uploadAvatar.mutate(file);
              }}
            />
          </div>

          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.full_name || user.username}</p>
            <p className="text-sm text-muted-foreground">{formatPhone(user.phone)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shaxsiy ma'lumotlar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">Ism</Label>
            <Input
              id="first_name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Familiya</Label>
            <Input
              id="last_name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="siz@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Shahar</Label>
            <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="district">Tuman</Label>
            <Input
              id="district"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button className="rounded-full" loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Saqlash
            </Button>
          </div>
        </CardContent>
      </Card>

      {notifications && (
        <Card>
          <CardHeader>
            <CardTitle>Bildirishnomalar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              label="Saytdagi bildirishnomalar"
              checked={notifications.notify_web}
              disabled={save.isPending}
              onChange={(value) => save.mutate({ notify_web: value })}
            />
            <ToggleRow
              label="Email xabarlari"
              checked={notifications.notify_email}
              disabled={save.isPending}
              onChange={(value) => save.mutate({ notify_email: value })}
            />
            <ToggleRow
              label="Telegram xabarlari"
              checked={notifications.notify_telegram}
              disabled={save.isPending}
              onChange={(value) => save.mutate({ notify_telegram: value })}
            />
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        className="w-full rounded-full text-destructive"
        onClick={async () => {
          await signOut();
          navigate("/login", { replace: true });
        }}
      >
        <LogOut className="h-4 w-4" />
        Hisobdan chiqish
      </Button>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
