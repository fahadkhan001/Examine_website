"use client";

import { useState } from "react";
import type { ClientAudit } from "@/lib/server/audits";
import { Turnstile, useTurnstileToken } from "./Turnstile";
import { cx, input } from "./ui";

export function UnlockCard({ audit, issueCount, onUnlocked }: { audit: ClientAudit; issueCount: number; onUnlocked: (a: ClientAudit) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnstile = useTurnstileToken();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/audits/${audit.id}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, company, consent, turnstileToken: turnstile.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not unlock");
      onUnlocked(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock");
      turnstile.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="unlock" className="relative overflow-hidden rounded-2xl border border-ink/80 bg-ink p-5 text-bg shadow-card sm:p-7">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40 [--dot:rgba(255,255,255,0.08)] dark:[--dot:rgba(0,0,0,0.08)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-accent">free full report</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            See all {issueCount} issues and exactly how to fix them
          </h2>
          <ul className="mt-4 space-y-1.5 text-sm text-bg/75">
            <li>→ Evidence, impact and copy-paste fixes for every issue</li>
            <li>→ Branded PDF to share with your developer or client</li>
            <li>→ Optional monitoring with alerts when something breaks</li>
          </ul>
        </div>
        <form onSubmit={submit} className="space-y-2.5" noValidate>
          <label className="sr-only" htmlFor="unlock-email">Work email</label>
          <input id="unlock-email" type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={cx(input, "border-transparent text-[15px]")} />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="sr-only" htmlFor="unlock-name">Name</label>
            <input id="unlock-name" autoComplete="name" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} className={cx(input, "border-transparent")} />
            <label className="sr-only" htmlFor="unlock-company">Company</label>
            <input id="unlock-company" autoComplete="organization" placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} className={cx(input, "border-transparent")} />
          </div>
          <label className="flex items-start gap-2 pt-1 text-xs text-bg/70">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            Send me occasional tips on website security and speed. Unsubscribe anytime.
          </label>
          <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-ink transition hover:brightness-105 active:translate-y-px disabled:opacity-60">
            {busy ? "Unlocking…" : "Unlock full report"}
          </button>
          {error && <p role="alert" className="text-sm text-[#ff8f92]">{error}</p>}
          <Turnstile onToken={turnstile.set} resetKey={turnstile.resetKey} />
          <p className="text-[11px] text-bg/50">No spam. We store your email only to send what you ask for. <a href="/privacy" className="underline">Privacy</a></p>
        </form>
      </div>
    </section>
  );
}
