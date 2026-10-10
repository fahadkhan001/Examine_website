"use client";

import { useState } from "react";
import type { Finding, LockedFinding } from "@/lib/audit/types";
import { cx, SeverityChip, StatusIcon } from "./ui";

const isFull = (f: Finding | LockedFinding): f is Finding => "whyItMatters" in f;

export function FindingCard({ finding, defaultOpen = false, onLockedClick }: { finding: Finding | LockedFinding; defaultOpen?: boolean; onLockedClick?: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const full = isFull(finding);
  const expandable = finding.status !== "pass" || full;

  return (
    <article
      id={`finding-${finding.id}`}
      className={cx(
        "rounded-2xl border bg-raised transition",
        open ? "border-line-strong shadow-card" : "border-line hover:border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={() => (full ? setOpen((o) => !o) : onLockedClick?.())}
        aria-expanded={full ? open : undefined}
        disabled={!expandable && !full}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <StatusIcon status={finding.status} severity={finding.severity} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-ink">{finding.title}</span>
          {full ? (
            <span className="mt-0.5 block text-sm leading-snug text-muted">{finding.summary}</span>
          ) : finding.status !== "pass" ? (
            <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>
              <span className="select-none blur-[3px]" aria-hidden>Details and fix steps hidden here</span>
              <span className="sr-only">Unlock the report to see details</span>
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <SeverityChip severity={finding.severity} status={finding.status} />
          {full && (
            <svg viewBox="0 0 16 16" className={cx("size-4 text-muted transition", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6l4 4 4-4" /></svg>
          )}
        </span>
      </button>

      {full && open && (
        <div className="animate-rise space-y-4 border-t border-line px-4 pb-5 pt-4 sm:px-5 sm:pl-[52px]">
          {finding.evidence && (
            <Block label="Evidence">
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-sunken px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink-2">{finding.evidence}</pre>
            </Block>
          )}
          <Block label="Why it matters">
            <p className="text-sm leading-relaxed text-ink-2">{finding.whyItMatters}</p>
          </Block>
          {finding.status !== "pass" && (
            <Block label="How to fix">
              <p className="text-sm leading-relaxed text-ink-2">{finding.howToFix}</p>
              {finding.fixSnippet && <Snippet code={finding.fixSnippet} />}
            </Block>
          )}
        </div>
      )}
    </article>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</h4>
      {children}
    </section>
  );
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2.5">
      <pre className="overflow-x-auto rounded-xl bg-[#0b0d10] px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-[#d6dbe1] dark:bg-black/40"><code>{code}</code></pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-[#d6dbe1] transition hover:bg-white/15"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
