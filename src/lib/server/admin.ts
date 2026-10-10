import { count, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { audits, leads, monitors } from "@/lib/db/schema";

export async function adminOverview() {
  const db = await getDb();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [[a], [a7], [l], [m], recentAudits, monitorRows] = await Promise.all([
    db.select({ n: count() }).from(audits),
    db.select({ n: count() }).from(audits).where(gt(audits.createdAt, since)),
    db.select({ n: count() }).from(leads),
    db.select({ n: count() }).from(monitors).where(eq(monitors.active, true)),
    db
      .select({ id: audits.id, host: audits.host, status: audits.status, score: audits.score, grade: audits.grade, createdAt: audits.createdAt, monitorId: audits.monitorId })
      .from(audits)
      .orderBy(desc(audits.createdAt))
      .limit(25),
    db.select().from(monitors).orderBy(desc(monitors.createdAt)).limit(100),
  ]);
  return {
    stats: { audits: a.n, audits7d: a7.n, leads: l.n, activeMonitors: m.n },
    recentAudits,
    monitors: monitorRows,
  };
}
