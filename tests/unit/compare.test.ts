import { describe, expect, it } from "vitest";
import { compareCategories, compareChecks, verdict, winnerOf } from "@/lib/audit/compare";
import type { LockedFinding } from "@/lib/audit/types";

describe("winnerOf", () => {
  it("respects direction and tolerance", () => {
    expect(winnerOf(90, 70, "higher")).toBe("a");
    expect(winnerOf(1800, 4200, "lower")).toBe("a");
    expect(winnerOf(91, 90, "higher", 2)).toBe("tie");
    expect(winnerOf(undefined, 3, "lower")).toBeNull();
  });
});

describe("compareChecks", () => {
  const f = (id: string, status: LockedFinding["status"]): LockedFinding => ({ id, status, title: id, category: "seo", severity: "medium" });
  it("pairs checks and never scores n/a", () => {
    const rows = compareChecks([f("x", "pass"), f("y", "fail"), f("z", "info")], [f("x", "fail"), f("y", "fail"), f("z", "pass")]);
    expect(rows.find((r) => r.id === "x")).toMatchObject({ winner: "a", differs: true });
    expect(rows.find((r) => r.id === "y")).toMatchObject({ winner: "tie", differs: false });
    expect(rows.find((r) => r.id === "z")?.winner).toBeNull();
  });
});

describe("verdict", () => {
  it("names the leader and counts category wins", () => {
    const cats = compareCategories(
      [{ category: "seo", score: 90, passed: 0, warnings: 0, failed: 0 }, { category: "security", score: 40, passed: 0, warnings: 0, failed: 0 }],
      [{ category: "seo", score: 50, passed: 0, warnings: 0, failed: 0 }, { category: "security", score: 41, passed: 0, warnings: 0, failed: 0 }],
    );
    const v = verdict("a.com", "b.com", 80, 69, cats, []);
    expect(v.headline).toBe("a.com leads by 11 points");
    expect(v.categoryWins).toEqual({ a: 1, b: 0 });
  });
});
