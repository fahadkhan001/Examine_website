import type { AuditContext } from "./context";
import type { HeaderReport } from "./headers";

export const CATEGORIES = [
  "security",
  "exposure",
  "ssl",
  "seo",
  "performance",
  "accessibility",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; weight: number; blurb: string }> = {
  security: { label: "Security headers", weight: 25, blurb: "HTTPS, HSTS, CSP, framing, cookies, mixed content" },
  exposure: { label: "Exposed files", weight: 20, blurb: ".env, .git, backups, SQL dumps, phpinfo, directory listings" },
  ssl: { label: "SSL & domain", weight: 10, blurb: "Certificate expiry, TLS, redirects, SPF and DMARC" },
  seo: { label: "SEO", weight: 20, blurb: "Titles, meta, canonical, sitemap, robots.txt, broken links" },
  performance: { label: "Performance", weight: 15, blurb: "Core Web Vitals, page weight, caching, compression" },
  accessibility: { label: "Accessibility", weight: 10, blurb: "Alt text, labels, link names, Lighthouse a11y" },
};

export type Status = "pass" | "warn" | "fail" | "info";
export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** What a check's run() returns. Static copy lives on the CheckDef. */
export interface CheckOutcome {
  status: Status;
  summary: string;
  evidence?: string;
  /** Overrides the definition's default severity (e.g. a worse variant). */
  severity?: Severity;
}

export interface CheckDef {
  id: string;
  category: Category;
  title: string;
  /** Severity when the check does not pass. */
  severity: Severity;
  /** Relative weight inside its category. */
  weight: number;
  whyItMatters: string;
  howToFix: string;
  fixSnippet?: string;
  run(ctx: AuditContext): Promise<CheckOutcome> | CheckOutcome;
}

export interface Finding {
  id: string;
  category: Category;
  title: string;
  status: Status;
  severity: Severity;
  weight: number;
  summary: string;
  evidence?: string;
  whyItMatters: string;
  howToFix: string;
  fixSnippet?: string;
}

/** Finding without the gated details, sent to clients that have not unlocked. */
export type LockedFinding = Pick<Finding, "id" | "category" | "title" | "status" | "severity">;

export interface CategoryScore {
  category: Category;
  score: number | null;
  passed: number;
  warnings: number;
  failed: number;
}

/** One crawled route, as stored and shown in the report. */
export interface PageRow {
  url: string;
  finalUrl?: string;
  status?: number;
  redirects: number;
  title?: string;
  description?: string;
  h1Count?: number;
  canonical?: string;
  noindex?: boolean;
  ttfbMs?: number;
  bytes?: number;
  error?: string;
  foundOn: string;
}

/** Headline numbers used for side-by-side comparison. Missing = not measured. */
export interface AuditMetrics {
  mobileScore?: number;
  desktopScore?: number;
  accessibilityScore?: number;
  lcpMs?: number;
  cls?: number;
  tbtMs?: number;
  pageBytes?: number;
  requests?: number;
  ttfbMs?: number;
  pagesCrawled?: number;
  brokenPages?: number;
  certDaysLeft?: number;
  issues?: number;
  criticalHigh?: number;
}

export interface AuditResult {
  headers: HeaderReport;
  metrics: AuditMetrics;
  pages: PageRow[];
  /** Why Google PageSpeed data is missing, when it is. */
  speedNote?: string;
  inputUrl: string;
  finalUrl: string;
  pageTitle?: string;
  score: number;
  grade: Grade;
  categoryScores: CategoryScore[];
  findings: Finding[];
  durationMs: number;
}

export type Grade = "A" | "B" | "C" | "D" | "F";
