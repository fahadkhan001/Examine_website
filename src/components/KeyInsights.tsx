"use client";

import type { Insight } from "@/lib/audit/insights";
import { cx } from "./ui";

const TONE = {
  bad: { dot: "bg-critical", ring: "border-critical/25 bg-critical-soft/60", label: "Fix first" },
  warn: { dot: "bg-medium", ring: "border-medium/25 bg-medium-soft/60", label: "Worth fixing" },
  good: { dot: "bg-pass", ring: "border-pass/25 bg-accent-soft/60", label: "Going well" },
} as const;

/** The handful of plain-language takeaways, shown above the detailed findings. */
export function KeyInsights({ insights, onSelect }: { insights: Insight[]; onSelect: (findingIds: string[]) => void }) {
  if (!insights.length) return null;
  return (
    <section aria-labelledby="insights-heading" className="rounded-2xl border border-line bg-raised p-5 shadow-card sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="insights-heading" className="text-[17px] font-semibold tracking-tight">Key insights</h2>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">what matters most</span>
      </div>
      <ol className="mt-4 grid gap-2.5">
        {insights.map((ins, i) => (
          <li key={ins.headline}>
            <button
              type="button"
              onClick={() => onSelect(ins.findingIds)}
              className={cx("group flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition hover:shadow-card", TONE[ins.tone].ring)}
            >
              <span className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cx("size-2 shrink-0 rounded-full", TONE[ins.tone].dot)} />
                  <span className="text-[15px] font-semibold leading-snug text-ink">{ins.headline}</span>
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">{TONE[ins.tone].label}</span>
                </span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-2">{ins.detail}</span>
              </span>
              <svg viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3l5 5-5 5" /></svg>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
