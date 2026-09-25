import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export const YANDEX_CALLBACK_PATH = "/auth/yandex";
const YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize";
const MESSAGE_TYPE = "arena:yandex-auth";

/** Shape the callback route posts back to this window. */
export interface YandexAuthMessage {
  type: typeof MESSAGE_TYPE;
  access_token?: string;
  error?: string;
}

export function isYandexAuthMessage(value: unknown): value is YandexAuthMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === MESSAGE_TYPE
  );
}

export const YANDEX_MESSAGE_TYPE = MESSAGE_TYPE;

/**
 * Yandex ID sign-in.
 *
 * Yandex has no drop-in widget like Google's, so the popup is ours: it opens
 * the OAuth page in implicit mode, and `/auth/yandex` hands the token back
 * through postMessage before closing itself. The token is only a claim — the
 * backend spends it against Yandex's userinfo endpoint before issuing a session.
 */
export function YandexButton({
  clientId,
  onToken,
  disabled,
}: {
  clientId: string;
  onToken: (accessToken: string) => void;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    const handle = (event: MessageEvent) => {
      // The popup and this page share an origin; anything else is not ours.
      if (event.origin !== window.location.origin) return;
      if (!isYandexAuthMessage(event.data)) return;

      setPending(false);
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.access_token) tokenRef.current(event.data.access_token);
    };

    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  // A popup closed by hand never posts anything, so poll for that and release
  // the button instead of leaving it spinning forever.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setPending(false);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [pending]);

  const open = useCallback(() => {
    if (!clientId || pending) return;

    const redirectUri = `${window.location.origin}${YANDEX_CALLBACK_PATH}`;
    const url =
      `${YANDEX_AUTH_URL}?response_type=token` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&force_confirm=yes`;

    const width = 520;
    const height = 640;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popup = window.open(
      url,
      "yandex-oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );
    if (!popup) return; // Blocked by the browser; leave the button idle.

    popupRef.current = popup;
    setPending(true);
    popup.focus();
  }, [clientId, pending]);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={open}
      loading={pending}
      disabled={disabled || !clientId}
    >
      <span
        aria-hidden
        className="mr-2 grid h-5 w-5 place-items-center rounded-full bg-[#fc3f1d] text-sm font-bold text-white"
      >
        Я
      </span>
      Yandex bilan kirish
    </Button>
  );
}
