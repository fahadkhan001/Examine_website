"use client";

import { useState } from "react";
import { button, cx } from "./ui";

export function MonitorCard({ auditId, host }: { auditId: string; host: string }) {
  const [frequency, setFrequency] = useState<"weekly" | "daily">("weekly");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "sent" | "active" | "error"; message?: string }>({ kind: "idle" });

  async function subscribe() {
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/monitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auditId, frequency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start monitoring");
      setState(
        data.confirmed
          ? { kind: "active", message: `Monitoring is on. ${data.frequency === "daily" ? "Daily" : "Weekly"} checks go to ${data.email}.` }
          : { kind: "sent", message: `Check ${data.email} and click the link to start monitoring.` },
      );
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative size-2 rounded-full bg-accent" />
        </span>
        <h3 className="text-sm font-semibold">Monitor {host}</h3>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        We re-run this audit and email you if the site goes down, SSL is about to expire, a file gets exposed or the score drops.
      </p>
      {state.kind === "sent" || state.kind === "active" ? (
        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] text-ink-2" role="status">{state.message}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="Frequency">
            {(["weekly", "daily"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={frequency === f}
                onClick={() => setFrequency(f)}
                className={cx("rounded-lg py-1.5 text-[13px] font-medium capitalize transition", frequency === f ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink")}
              >
                {f}
              </button>
            ))}
          </div>
          <button type="button" onClick={subscribe} disabled={state.kind === "busy"} className={cx(button.secondary, "mt-3 w-full")}>
            {state.kind === "busy" ? "Setting up…" : "Start free monitoring"}
          </button>
          {state.kind === "error" && <p className="mt-2 text-[13px] text-critical" role="alert">{state.message}</p>}
        </>
      )}
    </section>
  );
}
