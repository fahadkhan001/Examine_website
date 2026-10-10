"use client";

import { useState } from "react";
import { button, cx } from "./ui";

interface State {
  frequency: "daily" | "weekly";
  active: boolean;
  confirmed: boolean;
}

export function ManageMonitor({ token, initial, nextRunAt }: { token: string; initial: State; nextRunAt: string }) {
  const [state, setState] = useState(initial);
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "frequency" | "pause" | "resume" | "delete", frequency?: State["frequency"]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/monitors/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, action, frequency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.deleted) setDeleted(true);
      else setState((s) => ({ ...s, frequency: data.frequency, active: data.active }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return <p className="mt-8 rounded-xl border border-line bg-raised p-4 text-sm">Monitoring deleted. You will not get further emails.</p>;
  }

  return (
    <section className="mt-8 space-y-5 rounded-2xl border border-line bg-raised p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">Status</span>
        <span className={cx("rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold", state.active && state.confirmed ? "bg-accent-soft text-pass" : "bg-sunken text-muted")}>
          {!state.confirmed ? "awaiting confirmation" : state.active ? "active" : "paused"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-ink-2">Frequency</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="Frequency">
          {(["weekly", "daily"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={state.frequency === f}
              disabled={busy}
              onClick={() => act("frequency", f)}
              className={cx("rounded-lg px-4 py-1.5 text-[13px] font-medium capitalize transition", state.frequency === f ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {state.active && state.confirmed && (
        <p className="text-[13px] text-muted" suppressHydrationWarning>Next check: {new Date(nextRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" disabled={busy} onClick={() => act(state.active ? "pause" : "resume")} className={button.secondary}>
          {state.active ? "Pause alerts" : "Resume alerts"}
        </button>
        <button type="button" disabled={busy} onClick={() => act("delete")} className={cx(button.secondary, "text-critical")}>
          Delete monitor
        </button>
      </div>
      {error && <p className="text-sm text-critical" role="alert">{error}</p>}
    </section>
  );
}
