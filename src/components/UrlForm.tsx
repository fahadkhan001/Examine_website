"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Turnstile, useTurnstileToken } from "./Turnstile";
import { cx } from "./ui";

export function UrlForm({ size = "lg", initial = "", autoFocus }: { size?: "lg" | "md"; initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnstile = useTurnstileToken();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Enter a website address, like example.com");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, turnstileToken: turnstile.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/r/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      turnstile.reset();
      setBusy(false);
    }
  }

  const lg = size === "lg";
  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div
        className={cx(
          "flex items-center gap-2 rounded-2xl border bg-raised p-1.5 shadow-card transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15",
          error ? "border-critical" : "border-line-strong",
        )}
      >
        <span className={cx("hidden select-none pl-3 font-mono text-muted sm:inline", lg ? "text-base" : "text-sm")}>https://</span>
        <label htmlFor="url-input" className="sr-only">Website address</label>
        <input
          id="url-input"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={cx(
            "min-w-0 flex-1 bg-transparent pl-3 font-mono text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none sm:pl-0",
            lg ? "py-3 text-base sm:text-lg" : "py-2 text-sm",
          )}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : undefined}
        />
        <button
          type="submit"
          disabled={busy}
          className={cx(
            "inline-flex shrink-0 items-center gap-2 rounded-xl bg-ink font-semibold text-bg transition hover:opacity-90 active:translate-y-px disabled:opacity-60",
            lg ? "px-5 py-3 text-[15px]" : "px-4 py-2 text-sm",
          )}
        >
          {busy ? (
            <>
              <span className="size-3.5 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
              Starting
            </>
          ) : (
            <>
              Examine
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </>
          )}
        </button>
      </div>
      {error && (
        <p id="url-error" role="alert" className="mt-2 pl-2 text-sm text-critical">
          {error}
        </p>
      )}
      <Turnstile onToken={turnstile.set} resetKey={turnstile.resetKey} />
    </form>
  );
}
