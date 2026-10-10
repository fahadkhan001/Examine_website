import { limits } from "@/lib/config";
import { ALL_CHECKS } from "./checks";
import { isBlocked } from "./checks/seo";
import { createContext, type AuditContext } from "./context";
import { buildHeaderReport } from "./headers";
import { scoreFindings } from "./score";
import type { AuditMetrics, AuditResult, CheckDef, CheckOutcome, Finding } from "./types";
import { mapLimit, withTimeout } from "./util";

export interface RunOptions {
  checks?: CheckDef[];
  /** Called after each check completes. */
  onProgress?: (done: number, total: number, finding: Finding) => void | Promise<void>;
  /** Inject a context (tests). */
  context?: AuditContext;
}

function toFinding(def: CheckDef, outcome: CheckOutcome): Finding {
  return {
    id: def.id,
    category: def.category,
    title: def.title,
    weight: def.weight,
    whyItMatters: def.whyItMatters,
    howToFix: def.howToFix,
    fixSnippet: def.fixSnippet,
    status: outcome.status,
    severity: outcome.severity ?? def.severity,
    summary: outcome.summary,
    evidence: outcome.evidence,
  };
}

export async function runAudit(inputUrl: URL, opts: RunOptions = {}): Promise<AuditResult> {
  const started = Date.now();
  const deadline = started + limits.auditBudgetMs;
  const ctx = opts.context ?? (await createContext(inputUrl));
  // Kick off the slow external call immediately so it overlaps everything else.
  void ctx.psi().catch(() => undefined);

  const checks = opts.checks ?? ALL_CHECKS;
  let done = 0;
  const findings = await mapLimit(checks, limits.checkConcurrency, async (def) => {
    let finding: Finding;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      finding = toFinding(def, { status: "info", summary: "Skipped: the audit ran out of time." });
    } else {
      try {
        const outcome = await withTimeout(Promise.resolve(def.run(ctx)), remaining, def.title);
        finding = toFinding(def, outcome);
      } catch (e) {
        finding = toFinding(def, {
          status: "info",
          summary: `Could not test: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
    done++;
    await opts.onProgress?.(done, checks.length, finding);
    return finding;
  });

  const { score, grade, categoryScores } = scoreFindings(findings);
  const crawl = await ctx.crawl().catch(() => ({ pages: [] }));
  const psi = await ctx.psi().catch(() => ({ error: "PageSpeed Insights failed" }) as Awaited<ReturnType<typeof ctx.psi>>);
  const pages = crawl.pages.map((p) => {
    const { isHtml, ...row } = p;
    void isHtml;
    return row;
  });
  const run = psi.mobile ?? psi.desktop;
  const tls = await ctx.tls().catch(() => null);
  const issues = findings.filter((f) => f.status === "fail" || f.status === "warn");
  const metrics: AuditMetrics = {
    mobileScore: psi.mobile?.performance,
    desktopScore: psi.desktop?.performance,
    accessibilityScore: run?.accessibility,
    lcpMs: run?.field?.lcpMs ?? run?.audits["largest-contentful-paint"]?.numericValue,
    cls: run?.field?.cls ?? run?.audits["cumulative-layout-shift"]?.numericValue,
    tbtMs: run?.audits["total-blocking-time"]?.numericValue,
    pageBytes: run?.audits["total-byte-weight"]?.numericValue,
    requests: run?.audits["network-requests"]?.itemCount,
    ttfbMs: Math.round(ctx.home.ttfbMs),
    pagesCrawled: pages.length,
    brokenPages: pages.filter((p) => !isBlocked(p.status) && ((p.error && !p.error.startsWith("skipped")) || (p.status ?? 0) >= 400)).length,
    certDaysLeft: tls?.daysLeft,
    issues: issues.length,
    criticalHigh: issues.filter((f) => f.status === "fail" && (f.severity === "critical" || f.severity === "high")).length,
  };

  return {
    headers: buildHeaderReport(ctx.home, findings),
    metrics,
    inputUrl: inputUrl.toString(),
    finalUrl: ctx.url.toString(),
    pageTitle: ctx.$("title").first().text().trim() || undefined,
    score,
    grade,
    categoryScores,
    findings,
    pages,
    speedNote: psi.mobile || psi.desktop ? undefined : psi.error ?? "Google PageSpeed data unavailable",
    durationMs: Date.now() - started,
  };
}
