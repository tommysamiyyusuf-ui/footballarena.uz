import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";

export function OwnerProfilePage() {
  const navigate = useNavigate();
  const { user, setUser, signOut } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const save = useMutation({
    mutationFn: () =>
      authApi.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      }),
    onSuccess: (data) => {
      setUser(data);
      toast.success("Profil yangilandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      toast.success("Parol yangilandi");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!user) return null;

  const passwordMismatch = Boolean(newPassword) && newPassword !== repeatPassword;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Profil</h1>

      <Card>
        <CardHeader>
          <CardTitle>Hisob ma'lumotlari</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Login</Label>
            <Input value={user.username} disabled />
          </div>
          <div className="space-y-2">
            <Label>Telefon</Label>
            <Input value={formatPhone(user.phone)} disabled />
          </div>
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
            />
          </div>
          <div className="sm:col-span-2">
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Saqlash
            </Button>
          </div>
        </CardContent>
      </Card>

      {user.owner_profile && (
        <Card>
          <CardHeader>
            <CardTitle>Tashkilot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Kompaniya" value={user.owner_profile.company_name || "—"} />
            <Row label="Bog'lanish telefoni" value={formatPhone(user.owner_profile.contact_phone)} />
            <Row label="STIR" value={user.owner_profile.tax_id || "—"} />
            <Row
              label="Platforma komissiyasi"
              value={`${user.owner_profile.commission_percent}%`}
            />
            <p className="pt-2 text-xs text-muted-foreground">
              Kompaniya ma'lumotlari va komissiya foizini administrator o'zgartiradi.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parolni o'zgartirish</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="current_password">Joriy parol</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">Yangi parol</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repeat_password">Takrorlang</Label>
            <Input
              id="repeat_password"
              type="password"
              autoComplete="new-password"
              value={repeatPassword}
              onChange={(event) => setRepeatPassword(event.target.value)}
            />
            {passwordMismatch && (
              <p className="text-sm text-destructive">Parollar mos kelmadi.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Button
              loading={changePassword.isPending}
              disabled={!currentPassword || !newPassword || passwordMismatch}
              onClick={() => changePassword.mutate()}
            >
              Parolni yangilash
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full text-destructive"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
