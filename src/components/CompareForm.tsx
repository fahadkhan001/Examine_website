"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Turnstile, useTurnstileToken } from "./Turnstile";
import { cx } from "./ui";

function SiteInput({ side, value, onChange, autoFocus }: { side: "A" | "B"; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const color = side === "A" ? "bg-side-a" : "bg-side-b";
  return (
    <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line-strong bg-raised px-3 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
      <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-bold text-white", color)}>{side}</span>
      <span className="sr-only">Website {side}</span>
      <input
        type="text"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={side === "A" ? "yoursite.com" : "competitor.com"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-[15px] text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none"
      />
    </label>
  );
}

export function CompareForm({ initialA = "", initialB = "" }: { initialA?: string; initialB?: string }) {
  const router = useRouter();
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnstile = useTurnstileToken();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!a.trim() || !b.trim()) {
      setError("Enter both websites.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a, b, turnstileToken: turnstile.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the comparison");
      router.push(`/compare/${data.a}/${data.b}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the comparison");
      turnstile.reset();
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-raised p-2 shadow-card">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        <SiteInput side="A" value={a} onChange={setA} autoFocus />
        <button
          type="button"
          onClick={() => {
            setA(b);
            setB(a);
          }}
          title="Swap sites"
          aria-label="Swap sites"
          className="mx-auto flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-sunken font-mono text-[11px] font-bold text-muted transition hover:text-ink md:mx-0"
        >
          vs
        </button>
        <SiteInput side="B" value={b} onChange={setB} />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3.5 text-[15px] font-semibold text-bg transition hover:opacity-90 active:translate-y-px disabled:opacity-60"
        >
          {busy ? (
            <>
              <span className="size-3.5 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
              Starting
            </>
          ) : (
            "Compare"
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-2 pb-1 pt-2 text-sm text-critical">
          {error}
        </p>
      )}
      <Turnstile onToken={turnstile.set} resetKey={turnstile.resetKey} />
    </form>
  );
}
