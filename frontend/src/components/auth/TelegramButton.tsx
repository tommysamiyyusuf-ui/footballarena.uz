import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TelegramAuthData = Record<string, string | number>;

declare global {
  interface Window {
    onArenaTelegramAuth?: (user: TelegramAuthData) => void;
  }
}

function TelegramMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="#229ED9">
      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.56 8.16-1.86 8.78c-.14.62-.51.77-1.03.48l-2.85-2.1-1.37 1.32c-.15.15-.28.28-.58.28l.2-2.92 5.32-4.8c.23-.2-.05-.32-.36-.12l-6.57 4.14-2.83-.89c-.62-.19-.63-.62.13-.92l11.06-4.26c.51-.19.96.12.74 1.01Z" />
    </svg>
  );
}

/**
 * Telegram's official login widget. It posts the signed payload back through a
 * global callback; the backend re-checks the HMAC against the bot token, so a
 * forged payload is rejected there rather than trusted here.
 *
 * The widget lives in a cross-origin iframe whose blue pill cannot be restyled,
 * so it is stretched invisibly over a button of our own: the row then matches
 * the Google and Yandex buttons while the click still lands on Telegram's own
 * markup.
 */
export function TelegramButton({
  botUsername,
  onAuth,
  disabled,
}: {
  botUsername: string;
  onAuth: (data: TelegramAuthData) => void;
  disabled?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef("");
  const [ready, setReady] = useState(false);
  const callbackRef = useRef(onAuth);
  callbackRef.current = onAuth;

  useEffect(() => {
    const host = hostRef.current;
    const widget = widgetRef.current;
    if (!botUsername || !host || !widget) return;

    window.onArenaTelegramAuth = (user) => callbackRef.current(user);

    // Telegram sizes the iframe to its own label, so scale it onto our button
    // instead of guessing: whatever width it picks, the whole surface stays
    // clickable.
    const fit = () => {
      const frame = widget.querySelector("iframe");
      if (!frame?.offsetWidth || !frame.offsetHeight) return;
      const next = `scale(${host.offsetWidth / frame.offsetWidth}, ${
        host.offsetHeight / frame.offsetHeight
      })`;
      if (next !== transformRef.current) {
        transformRef.current = next;
        frame.style.transformOrigin = "top left";
        frame.style.transform = next;
      }
      setReady(true);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onArenaTelegramAuth(user)");
    widget.appendChild(script);

    // The iframe only appears once the script runs, and is resized again when
    // its own content loads — watch for both rather than measuring once.
    const mutations = new MutationObserver(fit);
    mutations.observe(widget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["width", "height", "style"],
    });
    const resize = new ResizeObserver(fit);
    resize.observe(host);

    return () => {
      mutations.disconnect();
      resize.disconnect();
      widget.innerHTML = "";
      transformRef.current = "";
      setReady(false);
      delete window.onArenaTelegramAuth;
    };
  }, [botUsername]);

  return (
    <div ref={hostRef} className="group relative h-10 w-full">
      <div
        aria-hidden
        className={cn(
          buttonVariants({ variant: "outline" }),
          "pointer-events-none absolute inset-0 w-full transition-all",
          "group-hover:border-[#229ED9]/40 group-hover:bg-[#229ED9]/5 group-hover:text-foreground",
          "group-focus-within:ring-2 group-focus-within:ring-ring group-focus-within:ring-offset-2",
          !ready && "animate-pulse opacity-60",
          disabled && "opacity-50",
        )}
      >
        <TelegramMark className="h-5 w-5" />
        Telegram bilan kirish
      </div>

      <div
        ref={widgetRef}
        className={cn(
          "absolute inset-0 overflow-hidden opacity-0",
          (disabled || !ready) && "pointer-events-none",
        )}
      />
    </div>
  );
}
