"use client";

import { useState } from "react";
import type { HeaderGrade, HeaderReport, HeaderRow } from "@/lib/audit/headers";
import { cx } from "./ui";

export const GRADE_STYLE: Record<HeaderGrade, string> = {
  "A+": "bg-pass text-bg",
  A: "bg-pass text-bg",
  B: "bg-[#5a9e1a] text-white",
  C: "bg-medium text-bg",
  D: "bg-high text-white",
  E: "bg-high text-white",
  F: "bg-critical text-white",
};

export function HeaderChip({ row, upcoming }: { row: HeaderRow; upcoming?: boolean }) {
  const tone = row.present
    ? row.weak
      ? "border-medium/40 bg-medium-soft text-medium"
      : "border-pass/30 bg-accent-soft text-pass"
    : upcoming
      ? "border-line-strong bg-sunken text-muted"
      : "border-critical/30 bg-critical-soft text-critical";
  return (
    <span title={`${row.about}${row.value ? `\n\n${row.name}: ${row.value}` : ""}`} className={cx("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11.5px] font-medium", tone)}>
      <span aria-hidden>{row.present ? (row.weak ? "!" : "✓") : "✕"}</span>
      {row.name}
      <span className="sr-only">{row.present ? (row.weak ? "present, needs fixing" : "present") : "missing"}</span>
    </span>
  );
}

/** securityheaders.com-style summary: grade, header chips, raw headers. */
export function SecurityHeadersPanel({ report, createdAt, unlocked, onUnlock }: { report: HeaderReport; createdAt: string; unlocked: boolean; onUnlock: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const missing = report.core.filter((c) => !c.present).length;
  const weak = report.core.filter((c) => c.weak).length;
  const good = report.core.filter((c) => c.counts && !c.weak).length;
  return (
    <section aria-labelledby="headers-heading" className="rounded-2xl border border-line bg-raised p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className={cx("flex size-20 shrink-0 items-center justify-center rounded-2xl text-4xl font-bold tracking-tight", GRADE_STYLE[report.grade])} aria-label={`Security headers grade ${report.grade}`}>
          {report.grade}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="headers-heading" className="text-[17px] font-semibold tracking-tight">Security headers</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {missing === 0 && weak === 0
              ? "All six core security headers are set correctly."
              : `${good} of 6 core headers set correctly${missing ? `, ${missing} missing` : ""}${weak ? `, ${weak} set but need fixing` : ""}. Grade works like securityheaders.com: A+ needs all six, HTTPS and no warnings.`}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[12px]">
            <dt className="text-muted">Site</dt>
            <dd className="truncate text-ink-2">{report.url}</dd>
            <dt className="text-muted">IP address</dt>
            <dd className="text-ink-2">{report.ip ?? "unknown"}</dd>
            <dt className="text-muted">Status</dt>
            <dd className="text-ink-2">HTTP {report.status}</dd>
            <dt className="text-muted">Report time</dt>
            <dd className="text-ink-2" suppressHydrationWarning>{new Date(createdAt).toUTCString()}</dd>
          </dl>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <h3 className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Core headers</h3>
          <div className="flex flex-wrap gap-1.5">{report.core.map((r) => <HeaderChip key={r.name} row={r} />)}</div>
        </div>
        <div>
          <h3 className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Upcoming headers <span className="font-normal normal-case tracking-normal">(not graded yet)</span></h3>
          <div className="flex flex-wrap gap-1.5">{report.upcoming.map((r) => <HeaderChip key={r.name} row={r} upcoming />)}</div>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        {unlocked && report.raw ? (
          <>
            <button type="button" onClick={() => setShowRaw((s) => !s)} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink" aria-expanded={showRaw}>
              <svg viewBox="0 0 16 16" className={cx("size-3.5 transition", showRaw && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3l5 5-5 5" /></svg>
              Raw response headers ({report.raw.length})
            </button>
            {showRaw && (
              <div className="mt-3 overflow-x-auto rounded-xl bg-sunken">
                <table className="w-full font-mono text-[12px]">
                  <tbody className="divide-y divide-line">
                    {report.raw.map(([k, v], i) => {
                      const security = /^(content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|cross-origin-|x-xss-protection|expect-ct|feature-policy)/i.test(k);
                      const leak = /^(server|x-powered-by|x-aspnet)/i.test(k);
                      return (
                        <tr key={`${k}-${i}`} className="align-top">
                          <td className={cx("whitespace-nowrap px-3 py-1.5 font-semibold", security ? "text-pass" : leak ? "text-medium" : "text-ink-2")}>{k.toLowerCase()}</td>
                          <td className="break-all px-3 py-1.5 text-ink-2">{v}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <button type="button" onClick={onUnlock} className="text-[13px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            Unlock the report to see all raw response headers
          </button>
        )}
      </div>
    </section>
  );
}
