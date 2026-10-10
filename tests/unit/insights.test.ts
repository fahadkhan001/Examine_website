import { expect, it } from "vitest";
import { buildInsights } from "@/lib/audit/insights";
import type { Finding } from "@/lib/audit/types";

const f = (id: string, category: Finding["category"], status: Finding["status"], summary = "", severity: Finding["severity"] = "medium"): Finding => ({
  id, category, status, summary, severity, weight: 1, title: id, whyItMatters: "", howToFix: "",
});

it("leads with the highest-impact problems and ends with what is going well", () => {
  const insights = buildInsights([
    f("thin-homepage", "seo", "fail"),
    f("query-gated-routes", "seo", "fail", "10 of 11 routes need ?session=…"),
    f("page-titles", "seo", "fail", "11 of 11 pages share the same title."),
    f("robots-txt", "seo", "fail"),
    f("sitemap", "seo", "fail"),
    f("psi-mobile", "performance", "warn", "61/100 on mobile"),
    f("page-weight", "performance", "fail", "18.0 MB (Lighthouse)"),
    f("exposed-env", "exposure", "pass"),
    f("cert-valid", "ssl", "pass"),
    f("cert-expiry", "ssl", "pass", "Expires in 50 days."),
    f("http-redirect", "security", "pass"),
  ]);
  expect(insights[0].headline).toBe("Google sees a splash screen, not your website");
  expect(insights.map((i) => i.headline)).toContain("Pages only work with a special link");
  expect(insights.find((i) => i.headline === "Slow on phones")?.detail).toContain("18.0 MB");
  expect(insights.at(-1)?.tone).toBe("good");
  expect(insights.filter((i) => i.tone !== "good").length).toBeLessThanOrEqual(5);
});

it("puts leaked files first", () => {
  const insights = buildInsights([f("thin-homepage", "seo", "fail"), f("exposed-git", "exposure", "fail", "", "critical")]);
  expect(insights[0].headline).toBe("Private files can be downloaded by anyone");
});
