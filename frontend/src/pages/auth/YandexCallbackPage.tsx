import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { YANDEX_MESSAGE_TYPE } from "@/components/auth/YandexButton";

/**
 * Landing spot for Yandex's OAuth redirect.
 *
 * Implicit mode returns the token in the URL fragment, which never reaches the
 * server. This page runs inside the popup: it reads the fragment, hands the
 * token to the window that opened it and closes. Reached directly (no opener)
 * it just explains itself instead of hanging on a spinner.
 */
export function YandexCallbackPage() {
  const [orphaned, setOrphaned] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token") ?? undefined;
    const error = params.get("error_description") ?? params.get("error") ?? undefined;

    if (!window.opener) {
      setOrphaned(true);
      return;
    }

    window.opener.postMessage(
      { type: YANDEX_MESSAGE_TYPE, access_token: accessToken, error },
      window.location.origin,
    );
    window.close();
  }, []);

  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      {orphaned ? (
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Bu sahifa o'zi ochilmaydi</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Yandex orqali kirish uchun login sahifasidagi tugmadan foydalaning —
            u shu oynani o'zi ochadi va yopadi.
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yandex javobi qayta ishlanmoqda…
        </p>
      )}
    </div>
  );
}
