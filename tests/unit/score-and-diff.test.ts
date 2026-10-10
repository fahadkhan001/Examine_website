import { describe, expect, it } from "vitest";
import { gradeFor, scoreFindings } from "@/lib/audit/score";
import type { Finding } from "@/lib/audit/types";
import type { AuditRow } from "@/lib/db/schema";
import { diffAudits } from "@/lib/server/monitoring";
import { sign, verify } from "@/lib/server/tokens";

const f = (id: string, category: Finding["category"], status: Finding["status"], severity: Finding["severity"] = "medium", weight = 1): Finding => ({
  id, category, status, severity, weight, title: id, summary: id, whyItMatters: "", howToFix: "",
});

describe("scoreFindings", () => {
  it("gives half credit for warnings and ignores info", () => {
    const { categoryScores } = scoreFindings([f("a", "seo", "pass"), f("b", "seo", "warn"), f("c", "seo", "info")]);
    expect(categoryScores.find((c) => c.category === "seo")!.score).toBe(75);
  });

  it("caps the grade at C when anything critical fails", () => {
    const findings = [
      ...Array.from({ length: 30 }, (_, i) => f(`p${i}`, "security", "pass")),
      f("env", "exposure", "fail", "critical", 1),
      ...Array.from({ length: 30 }, (_, i) => f(`e${i}`, "exposure", "pass")),
    ];
    const { score, grade } = scoreFindings(findings);
    expect(score).toBeLessThanOrEqual(79);
    expect(grade).toBe("C");
  });

  it("maps scores to grades", () => {
    expect([95, 85, 75, 65, 10].map(gradeFor)).toEqual(["A", "B", "C", "D", "F"]);
  });
});

describe("diffAudits", () => {
  const row = (findings: Finding[], extra: Partial<AuditRow> = {}) => ({ status: "done", score: 80, findings, ...extra }) as AuditRow;

  it("alerts on a newly exposed file and a score drop", () => {
    const prev = row([f("exposed-env", "exposure", "pass")], { score: 90 });
    const next = row([f("exposed-env", "exposure", "fail", "critical")], { score: 70 });
    const kinds = diffAudits(prev, next).map((a) => a.kind);
    expect(kinds).toContain("exposed:exposed-env");
    expect(kinds).toContain("score-drop");
  });

  it("does not re-alert on problems that already existed", () => {
    const prev = row([f("hsts", "security", "fail")]);
    const next = row([f("hsts", "security", "fail")]);
    expect(diffAudits(prev, next)).toEqual([]);
  });

  it("alerts when the site is down", () => {
    const next = row([], { status: "failed", error: "timeout" });
    expect(diffAudits(row([]), next)[0].kind).toBe("down");
  });
});

describe("tokens", () => {
  it("round-trips and rejects tampering and expiry", () => {
    const t = sign({ m: "abc", p: "manage" });
    expect(verify(t)).toMatchObject({ m: "abc" });
    expect(verify(t.slice(0, -2) + "xx")).toBeNull();
    expect(verify(sign({ m: "abc" }, -10))).toBeNull();
    expect(verify("garbage")).toBeNull();
  });
});
