import { CATEGORIES, CATEGORY_META, type CategoryScore, type Finding, type Grade } from "./types";

const CREDIT = { pass: 1, warn: 0.5, fail: 0 } as const;

export function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Category score = weighted share of credit (pass 1, warn 0.5, fail 0).
 * "info" findings (not testable) are excluded. Overall = category scores
 * weighted by CATEGORY_META. Any critical failure caps the result at 79 (C),
 * so a fast, pretty site with a leaked .env can never get an A or B.
 */
export function scoreFindings(findings: Finding[]): { score: number; grade: Grade; categoryScores: CategoryScore[] } {
  const categoryScores: CategoryScore[] = CATEGORIES.map((category) => {
    const fs = findings.filter((f) => f.category === category);
    let earned = 0;
    let possible = 0;
    for (const f of fs) {
      if (f.status === "info") continue;
      possible += f.weight;
      earned += f.weight * CREDIT[f.status];
    }
    return {
      category,
      score: possible ? Math.round((earned / possible) * 100) : null,
      passed: fs.filter((f) => f.status === "pass").length,
      warnings: fs.filter((f) => f.status === "warn").length,
      failed: fs.filter((f) => f.status === "fail").length,
    };
  });

  let total = 0;
  let weights = 0;
  for (const c of categoryScores) {
    if (c.score === null) continue;
    total += c.score * CATEGORY_META[c.category].weight;
    weights += CATEGORY_META[c.category].weight;
  }
  let score = weights ? Math.round(total / weights) : 0;
  const hasCritical = findings.some((f) => f.status === "fail" && f.severity === "critical");
  if (hasCritical) score = Math.min(score, 79);
  return { score, grade: gradeFor(score), categoryScores };
}
