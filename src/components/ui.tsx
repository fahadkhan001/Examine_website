import clsx from "clsx";
import Link from "next/link";
import type { Severity, Status } from "@/lib/audit/types";
import { brand } from "@/lib/config";

export const cx = clsx;

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cx("group inline-flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight", className)}>
      <span className="relative inline-flex size-2.5">
        <span className="absolute inset-0 rounded-full bg-accent opacity-60 group-hover:animate-ping" />
        <span className="relative size-2.5 rounded-full bg-accent" />
      </span>
      {brand.name.toLowerCase()}
    </Link>
  );
}

export const button = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-raised px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/40 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
  ghost: "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-sunken hover:text-ink",
};

export const input =
  "w-full rounded-xl border border-line-strong bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15";

const SEV_STYLE: Record<Severity, string> = {
  critical: "bg-critical-soft text-critical",
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
};

export function SeverityChip({ severity, status }: { severity: Severity; status: Status }) {
  if (status === "pass") return <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-pass">pass</span>;
  if (status === "info") return <span className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted">n/a</span>;
  return (
    <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider", SEV_STYLE[severity])}>
      {severity}
    </span>
  );
}

export function StatusIcon({ status, severity, className }: { status: Status | "pending"; severity?: Severity; className?: string }) {
  const base = cx("inline-flex size-[18px] shrink-0 items-center justify-center rounded-full", className);
  if (status === "pending") return <span className={cx(base, "border border-dashed border-line-strong")} aria-label="pending" />;
  if (status === "pass")
    return (
      <span className={cx(base, "bg-pass text-bg")} aria-label="passed">
        <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3.5 8.5l3 3 6-7" /></svg>
      </span>
    );
  if (status === "info")
    return <span className={cx(base, "bg-sunken font-mono text-[10px] font-bold text-muted")} aria-label="not tested">–</span>;
  const color = status === "fail" ? (severity === "critical" ? "bg-critical" : severity === "high" ? "bg-high" : severity === "medium" ? "bg-medium" : "bg-low") : "bg-medium";
  return (
    <span className={cx(base, color, "font-mono text-[11px] font-bold text-bg")} aria-label={status === "fail" ? "failed" : "warning"}>
      {status === "fail" ? "✕" : "!"}
    </span>
  );
}

export function gradeColor(grade: string | null | undefined): string {
  switch (grade) {
    case "A": return "var(--pass)";
    case "B": return "#5a9e1a";
    case "C": return "var(--medium)";
    case "D": return "var(--high)";
    default: return "var(--critical)";
  }
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--line-strong)";
  if (score >= 90) return "var(--pass)";
  if (score >= 70) return "var(--medium)";
  if (score >= 50) return "var(--high)";
  return "var(--critical)";
}
