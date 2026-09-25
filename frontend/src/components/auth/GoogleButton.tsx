import { useEffect, useRef } from "react";

interface GoogleAccounts {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

const SCRIPT_ID = "google-identity-services";

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("google script failed")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("google script failed"));
    document.head.appendChild(script);
  });
}

/**
 * Renders Google's own One Tap button. The client id comes from `/api/config/`
 * so no credential is baked into the bundle; the returned `id_token` is
 * verified server-side before any session is issued.
 */
export function GoogleButton({
  clientId,
  onCredential,
  disabled,
}: {
  clientId: string;
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    if (!clientId) return;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => callbackRef.current(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          width: containerRef.current.offsetWidth || 320,
          text: "continue_with",
          locale: "ru",
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div
      ref={containerRef}
      className={disabled ? "pointer-events-none opacity-60" : undefined}
      style={{ minHeight: 40 }}
    />
  );
}
