import { localLighthouseEnabled, runLocalLighthouse } from "./lighthouse-local";

/**
 * Google PageSpeed Insights (Lighthouse in Google's cloud). We call it instead of
 * running headless Chrome ourselves, which would not fit a serverless budget.
 */

export interface PsiAudit {
  id: string;
  title: string;
  score: number | null;
  numericValue?: number;
  displayValue?: string;
  itemCount?: number;
}

export interface PsiRun {
  performance?: number;
  accessibility?: number;
  seo?: number;
  bestPractices?: number;
  audits: Record<string, PsiAudit>;
  /** Field data (CrUX) percentiles, when Google has enough real-user traffic. */
  field?: { lcpMs?: number; inpMs?: number; cls?: number; category?: string };
  failingA11y: PsiAudit[];
}

export interface PsiData {
  mobile?: PsiRun;
  desktop?: PsiRun;
  error?: string;
  /** "google" = PageSpeed Insights; "local" = Lighthouse on this machine. */
  source?: "google" | "local";
}

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 38_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
function parse(json: any): PsiRun {
  const lh = json.lighthouseResult ?? {};
  const cats = lh.categories ?? {};
  const pct = (c: any) => (typeof c?.score === "number" ? Math.round(c.score * 100) : undefined);
  const audits: Record<string, PsiAudit> = {};
  for (const [id, a] of Object.entries<any>(lh.audits ?? {})) {
    audits[id] = {
      id,
      title: a.title,
      score: a.score ?? null,
      numericValue: a.numericValue,
      displayValue: a.displayValue,
      itemCount: Array.isArray(a.details?.items) ? a.details.items.length : undefined,
    };
  }
  const a11yRefs: any[] = cats.accessibility?.auditRefs ?? [];
  const failingA11y = a11yRefs
    .filter((r) => r.weight > 0)
    .map((r) => audits[r.id])
    .filter((a) => a && a.score !== null && a.score < 1);
  const m = json.loadingExperience?.metrics;
  const field = m
    ? {
        lcpMs: m.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        inpMs: m.INTERACTION_TO_NEXT_PAINT?.percentile,
        cls:
          typeof m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile === "number"
            ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
            : undefined,
        category: json.loadingExperience?.overall_category,
      }
    : undefined;
  return {
    performance: pct(cats.performance),
    accessibility: pct(cats.accessibility),
    seo: pct(cats.seo),
    bestPractices: pct(cats["best-practices"]),
    audits,
    field,
    failingA11y,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function run(url: string, strategy: "mobile" | "desktop"): Promise<PsiRun> {
  const qs = new URLSearchParams({ url, strategy });
  for (const c of ["performance", "accessibility", "seo", "best-practices"]) qs.append("category", c);
  if (process.env.PSI_API_KEY) qs.set("key", process.env.PSI_API_KEY);
  const res = await fetch(`${ENDPOINT}?${qs}`, { signal: AbortSignal.timeout(PSI_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const reason = /quota|rate/i.test(body) ? "quota exceeded" : `HTTP ${res.status}`;
    throw new Error(`PageSpeed Insights unavailable (${reason})`);
  }
  return parse(await res.json());
}

export async function fetchPsi(url: string): Promise<PsiData> {
  if (process.env.EXAMWEB_DISABLE_PSI === "1") return { error: "PageSpeed Insights disabled" };
  const [mobile, desktop] = await Promise.allSettled([run(url, "mobile"), run(url, "desktop")]);
  const data: PsiData = { source: "google" };
  if (mobile.status === "fulfilled") data.mobile = mobile.value;
  if (desktop.status === "fulfilled") data.desktop = desktop.value;
  if (!data.mobile && !data.desktop) {
    const r = mobile.status === "rejected" ? mobile.reason : null;
    data.error = r instanceof Error ? (r.name === "TimeoutError" ? "PageSpeed Insights timed out" : r.message) : "PageSpeed Insights failed";
    if (localLighthouseEnabled()) {
      // Mobile only: one local run takes 15–30 s, two would not fit the audit budget.
      try {
        return { source: "local", mobile: parse(await runLocalLighthouse(url, "mobile", 45_000)) };
      } catch (e) {
        data.error += `; local Lighthouse failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }
  return data;
}
