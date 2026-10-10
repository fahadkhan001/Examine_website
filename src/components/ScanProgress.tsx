"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_META } from "@/lib/audit/types";
import type { ClientAudit } from "@/lib/server/audits";
import { cx, StatusIcon } from "./ui";

/** Terminal-like live checklist while the audit runs. */
export function ScanProgress({ audit }: { audit: ClientAudit }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(audit.createdAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [audit.createdAt]);

  const done = new Map(audit.findings.map((f) => [f.id, f]));
  const pct = audit.total ? Math.round((audit.progress / audit.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <p className="font-mono text-sm text-muted">examining</p>
        <h1 className="mt-1 break-all text-3xl font-semibold tracking-tight sm:text-4xl">{audit.host}</h1>
        <p className="mt-3 text-sm text-muted">
          Running {audit.total} checks. Most sites finish in 15–40 seconds.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 font-mono text-xs text-muted">
          <span className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            {audit.status === "queued" ? "queued" : "scanning"}
          </span>
          <span className="tabular-nums">
            {audit.progress}/{audit.total} · {elapsed}s
          </span>
        </div>
        <div className="relative h-1 bg-sunken">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
          {pct < 100 && <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-accent/40 to-transparent [animation:sweep_1.6s_linear_infinite]" />}
        </div>

        <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 sm:p-6">
          {CATEGORIES.map((cat) => {
            const items = audit.plan.filter((p) => p.category === cat);
            const finished = items.filter((i) => done.has(i.id)).length;
            return (
              <section key={cat}>
                <h2 className="mb-2 flex items-baseline justify-between font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {CATEGORY_META[cat].label}
                  <span className="tabular-nums">{finished}/{items.length}</span>
                </h2>
                <ul className="space-y-1.5">
                  {items.map((item) => {
                    const f = done.get(item.id);
                    return (
                      <li key={item.id} className={cx("flex items-center gap-2.5 text-[13px] transition", f ? "text-ink-2" : "text-muted/70")}>
                        <StatusIcon status={f ? f.status : "pending"} severity={f?.severity} className={f ? "animate-rise" : undefined} />
                        <span className="truncate">{item.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-center font-mono text-xs text-muted">
        Read-only checks of public URLs. We never log in, submit forms or exploit anything.
      </p>
    </div>
  );
}
