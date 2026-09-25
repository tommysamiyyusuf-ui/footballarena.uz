import { ArrowLeft, Loader2, Lock, Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { authApi } from "@/api/auth";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { TelegramButton, type TelegramAuthData } from "@/components/auth/TelegramButton";
import { YandexButton } from "@/components/auth/YandexButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfig } from "@/hooks/useConfig";
import { errorMessage } from "@/lib/api";
import { HOME_BY_ROLE, useAuthStore } from "@/stores/auth";
import type { AuthResponse, Me, Tokens } from "@/types/api";

type Step = "phone" | "code" | "register";

/** `901234567` typed by the user becomes `+998901234567` for the API. */
function toE164(local: string): string {
  const digits = local.replace(/\D/g, "");
  return `+998${digits}`;
}

function formatLocal(digits: string): string {
  const d = digits.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(" ");
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useAuthStore((state) => state.signIn);
  const { data: config } = useConfig();

  const redirectTo = (location.state as { from?: string } | null)?.from;

  const finish = (tokens: Tokens, user: Me) => {
    signIn(tokens, user);
    const fallback = HOME_BY_ROLE[user.role];
    // Only honour a return path the role is actually allowed to open.
    const target = redirectTo && user.role === "USER" ? redirectTo : fallback;
    navigate(target, { replace: true });
  };

  const handleAuthResponse = (data: AuthResponse) => {
    toast.success(data.is_new_user ? "Xush kelibsiz!" : "Tizimga kirdingiz");
    finish(data.tokens, data.user);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 bg-primary bg-cover bg-center"
          style={{ backgroundImage: "url('/stadium-hero.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/45" />
        <div className="relative z-10 flex items-center gap-3 text-xl font-bold">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-2xl backdrop-blur">
            ⚽
          </span>
          Football Arena
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-bold leading-tight drop-shadow">
            Yaqin atrofdagi stadionni
            <br />
            bir daqiqada bron qiling
          </h1>
          <p className="max-w-md text-white/85 drop-shadow">
            Xaritadan tanlang, bo'sh vaqtni ko'ring va so'rov yuboring. Stadion egasi
            tasdiqlashi bilan xabar olasiz.
          </p>
        </div>
        <p className="relative z-10 text-sm text-white/75">O'zbekiston bo'ylab stadionlar</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center lg:hidden">
            <img src="/logo.png" alt="Football Arena" className="mx-auto h-16 w-auto object-contain" />
          </div>

          <Tabs defaultValue="phone">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone">
                <Phone className="mr-2 h-4 w-4" />
                Mijoz
              </TabsTrigger>
              <TabsTrigger value="password">
                <Lock className="mr-2 h-4 w-4" />
                Arendator / Admin
              </TabsTrigger>
            </TabsList>

            <TabsContent value="phone" className="mt-6">
              <PhonePanel
                onAuth={handleAuthResponse}
                googleClientId={
                  config?.auth.google_enabled ? config.auth.google_client_id : ""
                }
                yandexClientId={
                  config?.auth.yandex_enabled ? config.auth.yandex_client_id : ""
                }
                telegramBot={
                  config?.auth.telegram_enabled ? config.auth.telegram_bot_username : ""
                }
                otpLength={config?.otp.length ?? 6}
                resendCooldown={config?.otp.resend_cooldown_seconds ?? 60}
              />
            </TabsContent>

            <TabsContent value="password" className="mt-6">
              <PasswordPanel onAuth={handleAuthResponse} />
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-muted-foreground">
            Davom etish orqali siz foydalanish shartlariga rozilik bildirasiz.
          </p>
        </div>
      </main>
    </div>
  );
}

// --- Phone / social ----------------------------------------------------------

function PhonePanel({
  onAuth,
  googleClientId,
  yandexClientId,
  telegramBot,
  otpLength,
  resendCooldown,
}: {
  onAuth: (data: AuthResponse) => void;
  googleClientId: string;
  yandexClientId: string;
  telegramBot: string;
  otpLength: number;
  resendCooldown: number;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [localPhone, setLocalPhone] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const phone = useMemo(() => toE164(localPhone), [localPhone]);
  const phoneValid = localPhone.replace(/\D/g, "").length === 9;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const requestOtp = async () => {
    if (!phoneValid || pending) return;
    setPending(true);
    try {
      const data = await authApi.requestOtp(phone);
      setSecondsLeft(data.resend_after || resendCooldown);
      setStep("code");
      setCode("");
      if (data.debug_code) {
        // Development only — production responses never carry the code.
        toast.info(`Tasdiqlash kodi: ${data.debug_code}`, { duration: 15000 });
      } else {
        toast.success("Kod SMS orqali yuborildi");
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const verify = async (value: string) => {
    setPending(true);
    try {
      const data = await authApi.verifyOtp(phone, value);
      if (data.registration_required) {
        setToken(data.verification_token);
        setStep("register");
      } else {
        onAuth(data);
      }
    } catch (error) {
      setCode("");
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const completeRegistration = async () => {
    if (!firstName.trim() || pending) return;
    setPending(true);
    try {
      const data = await authApi.completeRegistration({
        verification_token: token,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      onAuth(data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const social = async (run: () => Promise<AuthResponse>) => {
    setPending(true);
    try {
      onAuth(await run());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  if (step === "register") {
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void completeRegistration();
        }}
      >
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Tanishib olaylik</h2>
          <p className="text-sm text-muted-foreground">
            Ismingizni kiriting — stadion egasi bronni shu nom bilan ko'radi.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="first_name">Ism *</Label>
          <Input
            id="first_name"
            autoFocus
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="Aziz"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="last_name">Familiya</Label>
          <Input
            id="last_name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Karimov"
          />
        </div>

        <Button type="submit" className="w-full" loading={pending} disabled={!firstName.trim()}>
          Davom etish
        </Button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setStep("phone")}
        >
          <ArrowLeft className="h-4 w-4" />
          Raqamni o'zgartirish
        </button>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Kodni kiriting</h2>
          <p className="text-sm text-muted-foreground">
            {`+998 ${formatLocal(localPhone.replace(/\D/g, ""))} raqamiga ${otpLength} xonali kod yuborildi.`}
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === otpLength) void verify(code);
          }}
        >
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={otpLength}
            value={code}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, otpLength);
              setCode(next);
              // Submitting automatically saves a tap on the most common path.
              if (next.length === otpLength && !pending) void verify(next);
            }}
            className="h-14 text-center text-2xl font-semibold tracking-[0.5em]"
            placeholder={"•".repeat(otpLength)}
          />

          <Button type="submit" className="w-full" loading={pending} disabled={code.length !== otpLength}>
            Tasdiqlash
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={secondsLeft > 0 || pending}
          onClick={() => void requestOtp()}
        >
          {secondsLeft > 0 ? `Qayta yuborish — ${secondsLeft}s` : "Kodni qayta yuborish"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void requestOtp();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="phone">Telefon raqam</Label>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background pl-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
            <span className="text-sm font-medium text-muted-foreground">+998</span>
            <Input
              id="phone"
              autoFocus
              inputMode="tel"
              autoComplete="tel-national"
              value={formatLocal(localPhone.replace(/\D/g, ""))}
              onChange={(event) => setLocalPhone(event.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="90 123 45 67"
              className="border-0 pl-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <Button type="submit" className="w-full" loading={pending} disabled={!phoneValid}>
          Kod olish
        </Button>
      </form>

      {(googleClientId || yandexClientId || telegramBot) && (
        <>
          <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            yoki
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            {googleClientId && (
              <GoogleButton
                clientId={googleClientId}
                disabled={pending}
                onCredential={(idToken) =>
                  void social(() => authApi.google({ id_token: idToken }))
                }
              />
            )}
            {yandexClientId && (
              <YandexButton
                clientId={yandexClientId}
                disabled={pending}
                onToken={(accessToken) =>
                  void social(() => authApi.yandex({ access_token: accessToken }))
                }
              />
            )}
            {telegramBot && (
              <TelegramButton
                botUsername={telegramBot}
                disabled={pending}
                onAuth={(data: TelegramAuthData) => void social(() => authApi.telegram(data))}
              />
            )}
          </div>
        </>
      )}

      {pending && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Tekshirilmoqda…
        </p>
      )}
    </div>
  );
}

// --- Username / password -----------------------------------------------------

function PasswordPanel({ onAuth }: { onAuth: (data: AuthResponse) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    try {
      onAuth(await authApi.passwordLogin(username.trim(), password));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="username">Login yoki email</Label>
        <Input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="owner_arena"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Parol</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        loading={pending}
        disabled={!username.trim() || !password}
      >
        Kirish
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Arendator hisobi faqat administrator tomonidan yaratiladi. Parolni unutgan bo'lsangiz
        qo'llab-quvvatlashga murojaat qiling.
      </p>
    </form>
  );
}
