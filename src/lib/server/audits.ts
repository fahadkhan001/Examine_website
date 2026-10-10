import { and, count, desc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ALL_CHECKS } from "@/lib/audit/checks";
import { UnreachableSiteError } from "@/lib/audit/context";
import { buildInsights, type Insight } from "@/lib/audit/insights";
import { runAudit } from "@/lib/audit/runner";
import { BlockedTargetError } from "@/lib/audit/safe-fetch";
import type { Category, Finding, LockedFinding, PageRow } from "@/lib/audit/types";
import { limits } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { audits, type AuditRow } from "@/lib/db/schema";

export async function createAudit(p: { url: string; ipHash?: string; monitorId?: string }): Promise<AuditRow> {
  const db = await getDb();
  const [row] = await db
    .insert(audits)
    .values({
      id: nanoid(12),
      url: p.url,
      host: new URL(p.url).host,
      ipHash: p.ipHash,
      monitorId: p.monitorId,
      total: ALL_CHECKS.length,
    })
    .returning();
  return row;
}

/** A finished (or in-flight) audit of the same URL inside the cache window. */
export async function findRecentAudit(url: string): Promise<AuditRow | undefined> {
  const db = await getDb();
  const since = new Date(Date.now() - limits.cacheWindowMs);
  const [row] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.url, url), gt(audits.createdAt, since)))
    .orderBy(desc(audits.createdAt))
    .limit(1);
  return row && row.status !== "failed" && !row.monitorId ? row : undefined;
}

export async function countRecentByIp(ipHash: string, windowMs: number): Promise<number> {
  const db = await getDb();
  const [r] = await db
    .select({ n: count() })
    .from(audits)
    .where(and(eq(audits.ipHash, ipHash), gt(audits.createdAt, new Date(Date.now() - windowMs))));
  return r?.n ?? 0;
}

export async function getAudit(id: string): Promise<AuditRow | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
  return row;
}

/** Runs the audit and persists progress. Never throws: failures are stored on the row. */
export async function executeAudit(id: string): Promise<AuditRow | undefined> {
  const db = await getDb();
  const row = await getAudit(id);
  if (!row) return undefined;
  await db.update(audits).set({ status: "running" }).where(eq(audits.id, id));

  const partial: Finding[] = [];
  let lastWrite = 0;
  try {
    const result = await runAudit(new URL(row.url), {
      onProgress: async (done, _total, finding) => {
        partial.push(finding);
        // Throttle writes; the client polls once a second anyway.
        if (Date.now() - lastWrite > 400) {
          lastWrite = Date.now();
          await db.update(audits).set({ progress: done, findings: partial }).where(eq(audits.id, id));
        }
      },
    });
    const [done] = await db
      .update(audits)
      .set({
        status: "done",
        progress: result.findings.length,
        finalUrl: result.finalUrl,
        pageTitle: result.pageTitle,
        score: result.score,
        grade: result.grade,
        categoryScores: result.categoryScores,
        findings: result.findings,
        pages: result.pages,
        speedNote: result.speedNote ?? null,
        metrics: result.metrics,
        headers: result.headers,
        durationMs: result.durationMs,
        finishedAt: new Date(),
      })
      .where(eq(audits.id, id))
      .returning();
    return done;
  } catch (e) {
    const message =
      e instanceof UnreachableSiteError || e instanceof BlockedTargetError
        ? e.message
        : "The audit failed unexpectedly. Please try again.";
    if (!(e instanceof UnreachableSiteError || e instanceof BlockedTargetError)) console.error("audit failed", id, e);
    const [failed] = await db
      .update(audits)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(audits.id, id))
      .returning();
    return failed;
  }
}

/** Public shape of an audit. Details are stripped unless the viewer unlocked. */
export interface ClientAudit {
  id: string;
  url: string;
  finalUrl: string | null;
  host: string;
  pageTitle: string | null;
  status: AuditRow["status"];
  progress: number;
  total: number;
  score: number | null;
  grade: AuditRow["grade"];
  categoryScores: AuditRow["categoryScores"];
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  unlocked: boolean;
  plan: { id: string; title: string; category: Category }[];
  findings: (Finding | LockedFinding)[];
  /** Crawled routes; empty until unlocked. */
  pages: PageRow[];
  pageCount: number;
  speedNote: string | null;
  /** Plain-language takeaways; shown to everyone once the audit is done. */
  insights: Insight[];
  metrics: AuditRow["metrics"];
  /** Header grade and rows for everyone; raw headers only once unlocked. */
  headers: AuditRow["headers"];
}

export const CHECK_PLAN = ALL_CHECKS.map((c) => ({ id: c.id, title: c.title, category: c.category }));

export function toClientAudit(row: AuditRow, unlocked: boolean): ClientAudit {
  const findings = row.findings.map((f) => (unlocked ? f : lock(f)));
  return {
    id: row.id,
    url: row.url,
    finalUrl: row.finalUrl,
    host: row.host,
    pageTitle: row.pageTitle,
    status: row.status,
    progress: row.progress,
    total: row.total,
    score: row.score,
    grade: row.grade,
    categoryScores: row.categoryScores,
    error: row.error,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    unlocked,
    plan: CHECK_PLAN,
    findings,
    pages: unlocked ? row.pages : [],
    pageCount: row.pages.length,
    speedNote: row.speedNote,
    insights: row.status === "done" ? buildInsights(row.findings, row.pages) : [],
    metrics: row.metrics,
    headers: row.headers ? { ...row.headers, raw: unlocked ? row.headers.raw : undefined } : null,
  };
}

function lock(f: Finding): LockedFinding {
  return { id: f.id, category: f.category, title: f.title, status: f.status, severity: f.severity };
}
