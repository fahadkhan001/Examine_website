import { CATEGORIES, type AuditMetrics, type Category, type CategoryScore, type Finding, type LockedFinding } from "./types";

/** Pure comparison helpers shared by the compare page (client) and tests. */

export type Side = "a" | "b" | "tie" | null;

export type Rating = "good" | "ok" | "poor";

export interface MetricDef {
  key: keyof AuditMetrics;
  /** Plain-language question the row answers. */
  label: string;
  /** One sentence on what the number means for visitors. */
  explain: string;
  better: "higher" | "lower";
  format: (v: number) => string;
  /** Good / needs work / poor, when there is a standard target. */
  rate?: (v: number) => Rating;
  /** Differences smaller than this count as a tie. */
  tolerance: number;
}

const secs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} seconds` : `${Math.round(v)} ms`);
const size = (v: number) => (v >= 1_048_576 ? `${(v / 1_048_576).toFixed(1)} MB` : `${Math.round(v / 1024)} KB`);
const outOf100 = (v: number) => `${Math.round(v)} / 100`;
const count = (word: string) => (v: number) => `${Math.round(v)} ${word}${Math.round(v) === 1 ? "" : "s"}`;
const band = (good: number, poor: number, higherIsBetter = false) => (v: number): Rating =>
  higherIsBetter ? (v >= good ? "good" : v >= poor ? "ok" : "poor") : v <= good ? "good" : v <= poor ? "ok" : "poor";

export const METRICS: MetricDef[] = [
  { key: "mobileScore", label: "Speed on phones", explain: "Google's speed score for mobile visitors. 90+ is fast.", better: "higher", format: outOf100, rate: band(90, 50, true), tolerance: 2 },
  { key: "desktopScore", label: "Speed on computers", explain: "Google's speed score for desktop visitors. 90+ is fast.", better: "higher", format: outOf100, rate: band(90, 50, true), tolerance: 2 },
  { key: "lcpMs", label: "Time until the page shows", explain: "How long visitors stare at a blank or half-loaded screen. Aim for under 2.5 seconds.", better: "lower", format: secs, rate: band(2500, 4000), tolerance: 150 },
  { key: "tbtMs", label: "Delay before taps work", explain: "How long the page freezes while scripts load. Under 200 ms feels instant.", better: "lower", format: secs, rate: band(200, 600), tolerance: 50 },
  { key: "cls", label: "Page jumping while loading", explain: "How much content shifts around, causing wrong taps. Under 0.1 is steady.", better: "lower", format: (v) => (v < 0.01 ? "None" : v.toFixed(2)), rate: band(0.1, 0.25), tolerance: 0.02 },
  { key: "pageBytes", label: "Download size", explain: "Data a visitor's phone downloads to open the page. Under 2 MB is light.", better: "lower", format: size, rate: band(2_000_000, 4_000_000), tolerance: 50_000 },
  { key: "requests", label: "Files loaded", explain: "Images, scripts and styles the page pulls in. Fewer usually means faster.", better: "lower", format: count("file"), rate: band(80, 150), tolerance: 3 },
  { key: "ttfbMs", label: "Server reply time", explain: "How quickly the server starts answering. Under 0.8 seconds is good.", better: "lower", format: secs, rate: band(800, 1800), tolerance: 60 },
  { key: "accessibilityScore", label: "Ease of use for everyone", explain: "Google's accessibility score: screen readers, contrast, labels. 90+ is good.", better: "higher", format: outOf100, rate: band(90, 70, true), tolerance: 2 },
  { key: "certDaysLeft", label: "Security certificate valid for", explain: "Days until the HTTPS certificate expires and browsers show a warning.", better: "higher", format: count("day"), rate: band(30, 14, true), tolerance: 0 },
  { key: "pagesCrawled", label: "Pages we could find", explain: "Pages reachable from the homepage and sitemap (we check up to 26).", better: "higher", format: count("page"), tolerance: 0 },
  { key: "brokenPages", label: "Broken pages", explain: "Links that lead to an error page. Should be zero.", better: "lower", format: count("page"), rate: (v) => (v === 0 ? "good" : v <= 2 ? "ok" : "poor"), tolerance: 0 },
  { key: "issues", label: "Problems found", explain: "All failed checks and warnings together.", better: "lower", format: count("problem"), tolerance: 0 },
  { key: "criticalHigh", label: "Serious problems", explain: "Critical and high-impact issues to fix first. Should be zero.", better: "lower", format: count("problem"), rate: (v) => (v === 0 ? "good" : v <= 2 ? "ok" : "poor"), tolerance: 0 },
];

export const RATING_LABEL: Record<Rating, string> = { good: "Good", ok: "Needs work", poor: "Poor" };

export function winnerOf(a: number | null | undefined, b: number | null | undefined, better: "higher" | "lower", tolerance = 0): Side {
  if (a == null || b == null) return null;
  if (Math.abs(a - b) <= tolerance) return "tie";
  return (better === "higher" ? a > b : a < b) ? "a" : "b";
}

export interface CategoryRow {
  category: Category;
  a: number | null;
  b: number | null;
  winner: Side;
}

export function compareCategories(a: CategoryScore[] | null, b: CategoryScore[] | null): CategoryRow[] {
  return CATEGORIES.map((category) => {
    const sa = a?.find((c) => c.category === category)?.score ?? null;
    const sb = b?.find((c) => c.category === category)?.score ?? null;
    return { category, a: sa, b: sb, winner: winnerOf(sa, sb, "higher", 2) };
  });
}

const RANK = { pass: 3, info: 2, warn: 1, fail: 0 } as const;

export interface CheckRow {
  id: string;
  title: string;
  category: Category;
  a?: Finding | LockedFinding;
  b?: Finding | LockedFinding;
  differs: boolean;
  winner: Side;
}

/** Check-by-check pairing. "info" (not testable) never wins or loses. */
export function compareChecks(a: (Finding | LockedFinding)[], b: (Finding | LockedFinding)[]): CheckRow[] {
  const mb = new Map(b.map((f) => [f.id, f]));
  const ids = [...new Set([...a.map((f) => f.id), ...b.map((f) => f.id)])];
  const ma = new Map(a.map((f) => [f.id, f]));
  return ids.map((id) => {
    const fa = ma.get(id);
    const fb = mb.get(id);
    const base = (fa ?? fb)!;
    let winner: Side = null;
    if (fa && fb && fa.status !== "info" && fb.status !== "info") {
      winner = RANK[fa.status] === RANK[fb.status] ? "tie" : RANK[fa.status] > RANK[fb.status] ? "a" : "b";
    }
    return { id, title: base.title, category: base.category, a: fa, b: fb, differs: fa?.status !== fb?.status, winner };
  });
}

export interface Verdict {
  winner: Side;
  margin: number;
  categoryWins: { a: number; b: number };
  checkWins: { a: number; b: number };
  headline: string;
}

export function verdict(hostA: string, hostB: string, scoreA: number | null, scoreB: number | null, cats: CategoryRow[], checks: CheckRow[]): Verdict {
  const categoryWins = { a: cats.filter((c) => c.winner === "a").length, b: cats.filter((c) => c.winner === "b").length };
  const checkWins = { a: checks.filter((c) => c.winner === "a").length, b: checks.filter((c) => c.winner === "b").length };
  const winner = winnerOf(scoreA, scoreB, "higher", 1);
  const margin = scoreA != null && scoreB != null ? Math.abs(scoreA - scoreB) : 0;
  const headline =
    winner === "tie"
      ? `${hostA} and ${hostB} are evenly matched`
      : winner === "a"
        ? `${hostA} leads by ${margin} point${margin === 1 ? "" : "s"}`
        : winner === "b"
          ? `${hostB} leads by ${margin} point${margin === 1 ? "" : "s"}`
          : "Waiting for both results";
  return { winner, margin, categoryWins, checkWins, headline };
}
