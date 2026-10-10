import { expect, it } from "vitest";
import type { Finding } from "@/lib/audit/types";
import type { AuditRow } from "@/lib/db/schema";
import { renderReportPdf } from "@/lib/pdf/report";

// Regression: a findings list long enough to span pages plus a pages table
// used to crash the PDF layout ("unsupported number").
it("renders a long report with a pages table", async () => {
  const finding = (i: number): Finding => ({
    id: `f${i}`, category: "seo", title: `Finding ${i}`, status: i % 3 ? "fail" : "warn", severity: "medium", weight: 1,
    summary: "Something is wrong on /our_essence.php?session=started and more.",
    evidence: Array.from({ length: 8 }, (_, j) => `• /very/long/route/number-${j}.php?session=started → shows the homepage/splash`).join("\n"),
    whyItMatters: "Because. ".repeat(30), howToFix: "Fix it. ".repeat(20), fixSnippet: "Header always set X-Frame-Options SAMEORIGIN",
  });
  const row = {
    id: "t", url: "https://site.test/", finalUrl: "https://site.test/", host: "site.test", pageTitle: "Site", status: "done",
    progress: 1, total: 1, score: 60, grade: "D", error: null, durationMs: 1, monitorId: null, ipHash: null, speedNote: "quota exceeded",
    createdAt: new Date(), finishedAt: new Date(),
    categoryScores: [{ category: "seo", score: 60, passed: 1, warnings: 1, failed: 1 }],
    findings: Array.from({ length: 30 }, (_, i) => finding(i)),
    pages: Array.from({ length: 25 }, (_, i) => ({
      url: `https://site.test/page_${i}_with_a_long_name.php?session=started`, finalUrl: `https://site.test/page_${i}.php`, status: i === 3 ? 404 : 200,
      redirects: i % 4 === 0 ? 1 : 0, title: "Same title for every page | Brand", description: i % 2 ? "x".repeat(130) : undefined, h1Count: i % 3, ttfbMs: 100 * i, foundOn: "sitemap",
    })),
  } as unknown as AuditRow;
  const pdf = await renderReportPdf(row);
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
}, 60_000);
