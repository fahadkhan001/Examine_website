"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export function useTurnstileToken() {
  const [token, setToken] = useState<string | undefined>();
  const [resetKey, setResetKey] = useState(0);
  return {
    token,
    set: setToken,
    resetKey,
    reset: useCallback(() => {
      setToken(undefined);
      setResetKey((k) => k + 1);
    }, []),
  };
}

/** Invisible Cloudflare Turnstile. Renders nothing when no site key is configured. */
export function Turnstile({ onToken, resetKey }: { onToken: (t: string) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !ready || !ref.current || !window.turnstile) return;
    const id = window.turnstile.render(ref.current, {
      sitekey: SITE_KEY,
      size: "flexible",
      appearance: "interaction-only",
      callback: onToken,
    });
    return () => window.turnstile?.remove(id);
  }, [ready, resetKey, onToken]);

  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} />
      <div ref={ref} className="mt-2" />
    </>
  );
}
