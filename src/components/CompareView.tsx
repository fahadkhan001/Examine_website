"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { compareCategories, compareChecks, METRICS, RATING_LABEL, verdict, winnerOf, type MetricDef } from "@/lib/audit/compare";
import type { HeaderRow } from "@/lib/audit/headers";
import type { Insight } from "@/lib/audit/insights";
import { CATEGORIES, CATEGORY_META, type Finding, type LockedFinding } from "@/lib/audit/types";
import type { ClientAudit } from "@/lib/server/audits";
import { ScoreRing } from "./ScoreRing";
import { GRADE_STYLE } from "./SecurityHeadersPanel";
import { button, cx, scoreColor, StatusIcon } from "./ui";
import { UnlockCard } from "./UnlockCard";

const running = (a: ClientAudit) => a.status === "queued" || a.status === "running";

function SideTag({ side, className }: { side: "a" | "b"; className?: string }) {
  return (
    <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold text-white", side === "a" ? "bg-side-a" : "bg-side-b", className)}>
      {side.toUpperCase()}
    </span>
  );
}

export function CompareView({ initialA, initialB }: { initialA: ClientAudit; initialB: ClientAudit }) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const anyRunning = running(a) || running(b);

  const refresh = useCallback(async () => {
    const [ra, rb] = await Promise.all([fetch(`/api/audits/${a.id}`, { cache: "no-store" }), fetch(`/api/audits/${b.id}`, { cache: "no-store" })]);
    if (ra.ok) setA(await ra.json());
    if (rb.ok) setB(await rb.json());
  }, [a.id, b.id]);

  useEffect(() => {
    if (!anyRunning) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh().catch(() => undefined);
      if (!stop) timer = setTimeout(poll, 1200);
    };
    timer = setTimeout(poll, 800);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [anyRunning, refresh]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">Website comparison</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight sm:text-4xl">
            <span className="flex min-w-0 items-center gap-2"><SideTag side="a" className="size-6 text-[12px]" /><span className="break-all">{a.host}</span></span>
            <span className="font-mono text-base font-normal text-muted">vs</span>
            <span className="flex min-w-0 items-center gap-2"><SideTag side="b" className="size-6 text-[12px]" /><span className="break-all">{b.host}</span></span>
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <CopyLink />
          <Link href={`/compare?a=${encodeURIComponent(a.host)}&b=${encodeURIComponent(b.host)}`} className={button.secondary}>New comparison</Link>
        </div>
      </header>

      {anyRunning ? <Progress a={a} b={b} /> : <Results a={a} b={b} onUnlocked={refresh} />}
    </div>
  );
}

function Progress({ a, b }: { a: ClientAudit; b: ClientAudit }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {([["a", a], ["b", b]] as const).map(([side, x]) => {
        const pct = x.status === "done" ? 100 : x.total ? Math.round((x.progress / x.total) * 100) : 0;
        return (
          <section key={side} className="rounded-2xl border border-line bg-raised p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 font-medium"><SideTag side={side} /><span className="truncate">{x.host}</span></span>
              <span className="font-mono text-xs text-muted">
                {x.status === "done" ? "done" : x.status === "failed" ? "failed" : `${x.progress}/${x.total}`}
              </span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className={cx("h-full transition-[width] duration-500", side === "a" ? "bg-side-a" : "bg-side-b")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-[13px] text-muted">
              {x.status === "done" ? `Score ${x.score}/100 (${x.grade}). Waiting for the other site…` : x.status === "failed" ? x.error : "Running security, SEO, speed and accessibility checks…"}
            </p>
          </section>
        );
      })}
    </div>
  );
}

function Results({ a, b, onUnlocked }: { a: ClientAudit; b: ClientAudit; onUnlocked: () => void }) {
  const [onlyDiff, setOnlyDiff] = useState(true);
  const cats = useMemo(() => compareCategories(a.categoryScores, b.categoryScores), [a.categoryScores, b.categoryScores]);
  const checks = useMemo(() => compareChecks(a.findings, b.findings), [a.findings, b.findings]);
  const v = verdict(a.host, b.host, a.score, b.score, cats, checks);
  const unlocked = a.unlocked && b.unlocked;
  const issuesA = a.findings.filter((f) => f.status === "fail" || f.status === "warn").length;
  const issuesB = b.findings.filter((f) => f.status === "fail" || f.status === "warn").length;

  return (
    <>
      {/* Verdict */}
      <section className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
        <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto_1fr] md:p-8">
          <SideScore audit={a} side="a" winner={v.winner === "a"} />
          <div className="order-first text-center md:order-none">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted">verdict</p>
            <p className="mt-1 max-w-64 text-balance text-lg font-semibold leading-snug">{v.headline}</p>
            <p className="mt-2 text-[13px] text-muted">
              Categories won: <b className="text-side-a">{v.categoryWins.a}</b> – <b className="text-side-b">{v.categoryWins.b}</b>
              <br />
              Checks won: <b className="text-side-a">{v.checkWins.a}</b> – <b className="text-side-b">{v.checkWins.b}</b>
            </p>
          </div>
          <SideScore audit={b} side="b" winner={v.winner === "b"} />
        </div>
        {(a.status === "failed" || b.status === "failed") && (
          <p className="border-t border-line bg-critical-soft px-6 py-3 text-sm text-critical">
            {[a, b].filter((x) => x.status === "failed").map((x) => `${x.host}: ${x.error}`).join(" · ")}
          </p>
        )}
      </section>

      {/* Category head-to-head */}
      <section className="rounded-2xl border border-line bg-raised p-5 shadow-card sm:p-6">
        <h2 className="text-[17px] font-semibold tracking-tight">Category by category</h2>
        <ul className="mt-5 space-y-4">
          {cats.map((c) => (
            <li key={c.category} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <Bar value={c.a} side="a" win={c.winner === "a"} />
              <span className="w-28 text-center text-[13px] font-medium text-ink-2 sm:w-36">{CATEGORY_META[c.category].label}</span>
              <Bar value={c.b} side="b" win={c.winner === "b"} />
            </li>
          ))}
        </ul>
      </section>

      {/* Metrics */}
      <section className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">Key numbers, in plain words</h2>
            <p className="mt-0.5 text-[13px] text-muted">Green = good, amber = needs work, red = poor. A tick marks the better site.</p>
          </div>
          {(a.speedNote || b.speedNote) && (
            <span className="text-[12px] text-medium">Speed not measured for {[a, b].filter((x) => x.speedNote).map((x) => x.host).join(", ")}</span>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-y border-line bg-sunken/50 font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="w-[44%] px-5 py-2 font-medium sm:px-6">What we measured</th>
                <th className="px-3 py-2 font-medium"><span className="flex items-center gap-1.5"><SideTag side="a" />{a.host}</span></th>
                <th className="px-3 py-2 font-medium"><span className="flex items-center gap-1.5"><SideTag side="b" />{b.host}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {METRICS.map((m) => {
                const va = m.key === "issues" ? issuesA : a.metrics?.[m.key];
                const vb = m.key === "issues" ? issuesB : b.metrics?.[m.key];
                if (va == null && vb == null) return null;
                const w = winnerOf(va, vb, m.better, m.tolerance);
                return (
                  <tr key={m.key} className="align-top">
                    <td className="px-5 py-3 sm:px-6">
                      <span className="block font-medium text-ink">{m.label}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{m.explain}</span>
                    </td>
                    <MetricCell value={va} def={m} win={w === "a"} />
                    <MetricCell value={vb} def={m} win={w === "b"} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {a.headers && b.headers && <HeadersCompare a={a} b={b} />}

      {!unlocked && (
        <UnlockCard audit={a} issueCount={issuesA + issuesB} onUnlocked={() => onUnlocked()} />
      )}

      {/* Insights side by side */}
      <section className="grid gap-4 md:grid-cols-2">
        <InsightColumn side="a" host={a.host} insights={a.insights} />
        <InsightColumn side="b" host={b.host} insights={b.insights} />
      </section>

      {/* Check by check */}
      <section>
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3 px-1">
          <h2 className="text-[17px] font-semibold tracking-tight">
            Check by check
            <span className="ml-2 text-[13px] font-normal text-muted">{checks.filter((c) => c.differs).length} of {checks.length} differ</span>
          </h2>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-[var(--accent)]" />
            Only differences
          </label>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-line bg-sunken/50 font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="w-[34%] px-4 py-2 font-medium">Check</th>
                <th className="w-[33%] px-3 py-2 font-medium"><span className="flex items-center gap-1.5"><SideTag side="a" />{a.host}</span></th>
                <th className="w-[33%] px-3 py-2 font-medium"><span className="flex items-center gap-1.5"><SideTag side="b" />{b.host}</span></th>
              </tr>
            </thead>
            {CATEGORIES.map((cat) => {
              const rows = checks.filter((r) => r.category === cat && (!onlyDiff || r.differs));
              if (!rows.length) return null;
              return (
                <tbody key={cat} className="divide-y divide-line border-b border-line last:border-b-0">
                  <tr className="bg-sunken/30">
                    <td colSpan={3} className="px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{CATEGORY_META[cat].label}</td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-2.5 font-medium text-ink">{r.title}</td>
                      <CheckCell f={r.a} win={r.winner === "a"} />
                      <CheckCell f={r.b} win={r.winner === "b"} />
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/r/${a.id}`} className={button.secondary}><SideTag side="a" />Full report: {a.host}</Link>
          <Link href={`/r/${b.id}`} className={button.secondary}><SideTag side="b" />Full report: {b.host}</Link>
        </div>
      </section>
    </>
  );
}

function HeadersCompare({ a, b }: { a: ClientAudit; b: ClientAudit }) {
  const ha = a.headers!;
  const hb = b.headers!;
  const rows = [...ha.core.map((r, i) => ({ r, o: hb.core[i], upcoming: false })), ...ha.upcoming.map((r, i) => ({ r, o: hb.upcoming[i], upcoming: true }))];
  const onlyA = rows.filter(({ r, o }) => r.present && !o.present).map(({ r }) => r.name);
  const onlyB = rows.filter(({ r, o }) => !r.present && o.present).map(({ r }) => r.name);
  const cell = (x: HeaderRow) =>
    x.present ? (
      <span className={cx("font-medium", x.weak ? "text-medium" : "text-pass")}>{x.weak ? (x.counts ? "! Set, needs fixing" : "! Set, but does nothing") : "✓ Set"}</span>
    ) : (
      <span className="font-medium text-critical">✕ Missing</span>
    );
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
      <div className="px-5 pt-5 sm:px-6">
        <h2 className="text-[17px] font-semibold tracking-tight">Security headers, side by side</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {onlyA.length || onlyB.length
            ? [onlyB.length && `${a.host} is missing ${onlyB.join(", ")}.`, onlyA.length && `${b.host} is missing ${onlyA.join(", ")}.`].filter(Boolean).join(" ")
            : "Both sites set the same headers."}
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-y border-line bg-sunken/50 font-mono text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="w-[44%] px-5 py-2 font-medium sm:px-6">Header</th>
              <th className="px-3 py-2 font-medium"><span className="flex items-center gap-1.5"><SideTag side="a" />{a.host}</span></th>
              <th className="px-3 py-2 font-medium"><span className="flex items-center gap-1.5"><SideTag side="b" />{b.host}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="px-5 py-3 font-medium sm:px-6">Header grade</td>
              <td className="px-3 py-3"><span className={cx("inline-flex h-7 min-w-9 items-center justify-center rounded-lg px-2 text-[15px] font-bold", GRADE_STYLE[ha.grade])}>{ha.grade}</span></td>
              <td className="px-3 py-3"><span className={cx("inline-flex h-7 min-w-9 items-center justify-center rounded-lg px-2 text-[15px] font-bold", GRADE_STYLE[hb.grade])}>{hb.grade}</span></td>
            </tr>
            {rows.map(({ r, o, upcoming }) => (
              <tr key={r.name} className={cx("align-top", r.present !== o.present && "bg-medium-soft/30")}>
                <td className="px-5 py-2.5 sm:px-6">
                  <span className="block font-mono text-[12.5px] font-medium text-ink">
                    {r.name}
                    {upcoming && <span className="ml-1.5 font-sans text-[11px] font-normal text-muted">upcoming</span>}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">{r.about}</span>
                </td>
                <td className="px-3 py-2.5 text-[13px]">{cell(r)}</td>
                <td className="px-3 py-2.5 text-[13px]">{cell(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SideScore({ audit, side, winner }: { audit: ClientAudit; side: "a" | "b"; winner: boolean }) {
  return (
    <div className={cx("flex flex-col items-center gap-3 rounded-2xl p-4 text-center", side === "a" ? "bg-side-a-soft" : "bg-side-b-soft")}>
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        <SideTag side={side} />
        <span className="break-all">{audit.host}</span>
      </span>
      {audit.status === "done" ? <ScoreRing score={audit.score ?? 0} grade={audit.grade ?? "F"} size={120} /> : <div className="flex size-[120px] items-center justify-center font-mono text-sm text-muted">{audit.status}</div>}
      <span className={cx("h-5 rounded-full px-2.5 font-mono text-[11px] font-semibold uppercase leading-5 tracking-wider", winner ? "bg-pass text-bg" : "invisible")}>winner</span>
    </div>
  );
}

function Bar({ value, side, win }: { value: number | null; side: "a" | "b"; win: boolean }) {
  const left = side === "a";
  return (
    <div className={cx("flex items-center gap-2", left ? "flex-row-reverse" : "")}>
      <div className={cx("h-2.5 flex-1 overflow-hidden rounded-full bg-sunken", left && "rotate-180")}>
        <div className={cx("h-full rounded-full transition-[width] duration-700", side === "a" ? "bg-side-a" : "bg-side-b", !win && "opacity-45")} style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className={cx("w-8 font-mono text-[13px] tabular-nums", left ? "text-left" : "text-right", win ? "font-bold" : "text-muted")} style={win ? { color: scoreColor(value) } : undefined}>
        {value ?? "–"}
      </span>
    </div>
  );
}

const RATING_STYLE = { good: "text-pass", ok: "text-medium", poor: "text-critical" } as const;

function MetricCell({ value, def, win }: { value: number | null | undefined; def: MetricDef; win: boolean }) {
  if (value == null) {
    return (
      <td className="px-3 py-3">
        <span className="text-muted">Not measured</span>
      </td>
    );
  }
  const rating = def.rate?.(value);
  return (
    <td className={cx("px-3 py-3", win && "bg-accent-soft/40")}>
      <span className={cx("flex items-center gap-1.5 font-mono text-[14px]", win ? "font-semibold text-ink" : "text-ink-2")}>
        {def.format(value)}
        {win && (
          <span className="inline-flex items-center gap-0.5 rounded bg-pass px-1.5 py-px font-sans text-[10.5px] font-semibold text-bg" title="Better of the two">
            ✓ Better
          </span>
        )}
      </span>
      {rating && <span className={cx("mt-0.5 block text-[12px] font-medium", RATING_STYLE[rating])}>{RATING_LABEL[rating]}</span>}
    </td>
  );
}

function CheckCell({ f, win }: { f?: Finding | LockedFinding; win: boolean }) {
  if (!f) return <td className="px-3 py-2.5 text-muted">–</td>;
  const summary = "summary" in f ? f.summary : null;
  return (
    <td className={cx("px-3 py-2.5", win && "bg-accent-soft/40")}>
      <span className="flex items-start gap-2">
        <StatusIcon status={f.status} severity={f.severity} className="mt-px" />
        <span className="min-w-0">
          <span className={cx("font-medium capitalize", f.status === "fail" ? "text-critical" : f.status === "warn" ? "text-medium" : f.status === "pass" ? "text-pass" : "text-muted")}>
            {f.status === "info" ? "n/a" : f.status === "warn" ? "warning" : f.status}
          </span>
          {summary && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{summary}</span>}
        </span>
      </span>
    </td>
  );
}

function InsightColumn({ side, host, insights }: { side: "a" | "b"; host: string; insights: Insight[] }) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <SideTag side={side} /> Key insights · <span className="truncate font-normal text-muted">{host}</span>
      </h2>
      <ul className="mt-3 space-y-2.5">
        {insights.map((i) => (
          <li key={i.headline} className="flex gap-2.5">
            <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", i.tone === "bad" ? "bg-critical" : i.tone === "warn" ? "bg-medium" : "bg-pass")} />
            <span>
              <span className="block text-[14px] font-medium leading-snug">{i.headline}</span>
              <span className="block text-[12.5px] leading-relaxed text-muted">{i.detail}</span>
            </span>
          </li>
        ))}
        {!insights.length && <li className="text-sm text-muted">No insights.</li>}
      </ul>
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={button.secondary}
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

