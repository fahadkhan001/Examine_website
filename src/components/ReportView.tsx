"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_META, SEVERITY_ORDER, type Category, type Finding, type LockedFinding, type Severity } from "@/lib/audit/types";
import type { ClientAudit } from "@/lib/server/audits";
import { CategoryBars } from "./CategoryBars";
import { FindingCard } from "./FindingCard";
import { KeyInsights } from "./KeyInsights";
import { MonitorCard } from "./MonitorCard";
import { PagesTable } from "./PagesTable";
import { SecurityHeadersPanel } from "./SecurityHeadersPanel";
import { ScanProgress } from "./ScanProgress";
import { ScoreRing } from "./ScoreRing";
import { button, cx, scoreColor } from "./ui";
import { UnlockCard } from "./UnlockCard";

type AnyFinding = Finding | LockedFinding;
type View = "issues" | "all" | "passed";

const STATUS_RANK = { fail: 0, warn: 1, info: 2, pass: 3 } as const;
const sortFindings = (a: AnyFinding, b: AnyFinding) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

export function ReportView({ initial }: { initial: ClientAudit }) {
  const [audit, setAudit] = useState(initial);
  const running = audit.status === "queued" || audit.status === "running";

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/audits/${audit.id}`, { cache: "no-store" });
        if (res.ok && !stop) setAudit(await res.json());
      } catch {
        // transient network error; keep polling
      }
      if (!stop) timer = setTimeout(poll, 1000);
    };
    let timer = setTimeout(poll, 800);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, audit.id]);

  if (running) return <ScanProgress audit={audit} />;
  if (audit.status === "failed") return <FailedState audit={audit} />;
  return <Report audit={audit} onUnlocked={setAudit} />;
}

function FailedState({ audit }: { audit: ClientAudit }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-line bg-raised p-8 text-center shadow-card">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-critical-soft font-mono text-lg font-bold text-critical">!</div>
      <h1 className="mt-4 text-xl font-semibold">We could not examine {audit.host}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{audit.error}</p>
      <p className="mt-2 text-sm text-muted">Check the address, make sure the site is online and not blocking automated visitors, then try again.</p>
      <Link href="/" className={cx(button.primary, "mt-6")}>Try another URL</Link>
    </div>
  );
}

function Report({ audit, onUnlocked }: { audit: ClientAudit; onUnlocked: (a: ClientAudit) => void }) {
  const [view, setView] = useState<View>("issues");
  const [category, setCategory] = useState<Category | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);

  const issues = audit.findings.filter((f) => f.status === "fail" || f.status === "warn");
  const passed = audit.findings.filter((f) => f.status === "pass");
  const counts = (["critical", "high", "medium", "low"] as const).map((s) => ({ s, n: issues.filter((f) => f.severity === s).length }));

  const visible = useMemo(() => {
    return audit.findings
      .filter((f) => (view === "issues" ? f.status === "fail" || f.status === "warn" : view === "passed" ? f.status === "pass" : true))
      .filter((f) => !category || f.category === category)
      .filter((f) => !severity || (f.severity === severity && f.status !== "pass" && f.status !== "info"))
      .sort(sortFindings);
  }, [audit.findings, view, category, severity]);

  const scrollToUnlock = () => document.getElementById("unlock")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const date = new Date(audit.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="animate-rise">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wider text-muted" suppressHydrationWarning>Website audit · {date}</p>
          <h1 className="mt-1 break-all text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-tight">{audit.host}</h1>
          {audit.pageTitle && <p className="mt-1 truncate text-sm text-muted">{audit.pageTitle}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <ShareButton />
          <RescanButton host={audit.host} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-2xl border border-line bg-raised p-5 shadow-card">
            <div className="flex items-center gap-5 lg:flex-col lg:items-stretch">
              <ScoreRing score={audit.score ?? 0} grade={audit.grade ?? "F"} size={132} className="lg:mx-auto" />
              <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] lg:mt-2">
                {counts.map(({ s, n }) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSeverity(severity === s ? null : s);
                      setView("issues");
                    }}
                    className={cx("flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 transition hover:bg-sunken", severity === s && "bg-sunken")}
                  >
                    <span className="flex items-center gap-1.5 capitalize text-ink-2">
                      <span className="size-2 rounded-sm" style={{ background: `var(--${s})` }} />
                      {s}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">{n}</span>
                  </button>
                ))}
                <span className="col-span-2 flex items-center justify-between gap-2 px-1.5 py-0.5">
                  <span className="flex items-center gap-1.5 text-ink-2"><span className="size-2 rounded-sm bg-pass" />passed</span>
                  <span className="font-mono font-semibold tabular-nums">{passed.length}</span>
                </span>
              </div>
            </div>
            <div className="mt-5 border-t border-line pt-3">
              <CategoryBars
                scores={audit.categoryScores ?? []}
                active={category}
                onSelect={(c) => setCategory(category === c ? null : c)}
              />
            </div>
          </section>

          {audit.unlocked ? (
            <>
              <Actions audit={audit} />
              <MonitorCard auditId={audit.id} host={audit.host} />
            </>
          ) : (
            <button type="button" onClick={scrollToUnlock} className={cx(button.primary, "w-full py-3")}>
              Unlock full report + PDF
            </button>
          )}
        </aside>

        <main className="min-w-0 space-y-6">
          <KeyInsights
            insights={audit.insights}
            onSelect={(ids) => {
              setCategory(null);
              setSeverity(null);
              setView("all");
              // Wait for the filtered list to render, then jump to the first related finding.
              setTimeout(() => {
                const el = ids.map((id) => document.getElementById(`finding-${id}`)).find(Boolean);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.classList.add("ring-2", "ring-accent");
                setTimeout(() => el?.classList.remove("ring-2", "ring-accent"), 1600);
              }, 50);
            }}
          />

          {!audit.unlocked && <UnlockCard audit={audit} issueCount={issues.length} onUnlocked={onUnlocked} />}

          {audit.headers && (!category || category === "security") && !severity && view !== "passed" && (
            <SecurityHeadersPanel report={audit.headers} createdAt={audit.createdAt} unlocked={audit.unlocked} onUnlock={scrollToUnlock} />
          )}

          {audit.speedNote && (
            <p className="flex gap-2.5 rounded-xl border border-medium/30 bg-medium-soft px-4 py-3 text-[13px] leading-relaxed text-ink-2" role="note">
              <span className="font-mono font-bold text-medium">!</span>
              <span>
                Google PageSpeed data was not available for this scan ({audit.speedNote}). Lighthouse speed, Core Web Vitals and accessibility scores are marked n/a, and the performance score uses server checks only. Run a new scan later for full speed data.
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-sunken p-1" role="tablist" aria-label="Filter findings">
              {([
                ["issues", `Issues ${issues.length}`],
                ["passed", `Passed ${passed.length}`],
                ["all", `All ${audit.findings.length}`],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cx("rounded-lg px-3 py-1.5 text-[13px] font-medium transition", view === v ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
            {(category || severity) && (
              <button type="button" onClick={() => { setCategory(null); setSeverity(null); }} className={button.ghost}>
                {[category && CATEGORY_META[category].label, severity].filter(Boolean).join(" · ")} ✕
              </button>
            )}
          </div>

          {CATEGORIES.filter((c) => !category || c === category).map((c) => {
            const items = visible.filter((f) => f.category === c);
            if (!items.length) return null;
            const cs = audit.categoryScores?.find((s) => s.category === c);
            return (
              <section key={c} aria-labelledby={`cat-${c}`}>
                <div className="mb-2.5 flex items-baseline justify-between gap-4 px-1">
                  <h2 id={`cat-${c}`} className="text-[15px] font-semibold">
                    {CATEGORY_META[c].label}
                    <span className="ml-2 text-[13px] font-normal text-muted">{CATEGORY_META[c].blurb}</span>
                  </h2>
                  <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: scoreColor(cs?.score) }}>{cs?.score ?? "–"}</span>
                </div>
                <div className="space-y-2">
                  {items.map((f) => (
                    <FindingCard key={f.id} finding={f} onLockedClick={scrollToUnlock} />
                  ))}
                </div>
              </section>
            );
          })}
          {audit.unlocked && audit.pages.length > 0 && view !== "passed" && !category && !severity && <PagesTable pages={audit.pages} />}
          {!audit.unlocked && audit.pageCount > 1 && (
            <button type="button" onClick={scrollToUnlock} className="w-full rounded-2xl border border-dashed border-line-strong p-5 text-left transition hover:border-ink/40">
              <span className="text-[15px] font-semibold">Pages scanned: {audit.pageCount} routes</span>
              <span className="mt-1 block text-[13px] text-muted">Status, redirects, title, meta description, H1 and response time for every route. Unlock to see the table.</span>
            </button>
          )}
          {visible.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-sm text-muted">
              {view === "issues" ? "No issues here. Nice work." : "Nothing matches these filters."}
            </p>
          )}
          <p className="pt-4 text-center font-mono text-xs text-muted">
            {audit.findings.length} checks · {audit.durationMs ? `${(audit.durationMs / 1000).toFixed(1)}s` : ""} · audited {audit.finalUrl}
          </p>
        </main>
      </div>
    </div>
  );
}

function Actions({ audit }: { audit: ClientAudit }) {
  const [mail, setMail] = useState<"idle" | "busy" | "sent" | "error">("idle");
  return (
    <section className="grid gap-2">
      <a href={`/api/audits/${audit.id}/pdf`} className={cx(button.primary, "py-3")}>
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" /></svg>
        Download PDF
      </a>
      <button
        type="button"
        disabled={mail === "busy" || mail === "sent"}
        onClick={async () => {
          setMail("busy");
          const res = await fetch(`/api/audits/${audit.id}/email`, { method: "POST" }).catch(() => null);
          setMail(res?.ok ? "sent" : "error");
        }}
        className={button.secondary}
      >
        {mail === "sent" ? "Sent to your inbox ✓" : mail === "busy" ? "Sending…" : mail === "error" ? "Failed, try again" : "Email me this report"}
      </button>
    </section>
  );
}

function RescanButton({ host }: { host: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={state === "busy"}
        className={button.primary}
        onClick={async () => {
          setState("busy");
          try {
            const res = await fetch("/api/audits", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url: host, fresh: true }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Could not start a new scan");
            router.push(`/r/${data.id}`);
          } catch (e) {
            setState(e instanceof Error ? e.message : "Could not start a new scan");
          }
        }}
      >
        {state === "busy" ? "Starting…" : "Re-scan"}
      </button>
      {state !== "idle" && state !== "busy" && <span className="mt-1 max-w-56 text-right text-[12px] text-critical">{state}</span>}
    </span>
  );
}

function ShareButton() {
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
