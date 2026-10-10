import { and, asc, desc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Finding } from "@/lib/audit/types";
import { appUrl, limits } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { alerts, audits, monitors, type AuditRow, type MonitorRow } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { confirmMonitorEmail, monitorEmail, type AlertItem } from "@/lib/email/templates";
import { createAudit, executeAudit, getAudit } from "./audits";
import { sign, verify } from "./tokens";

const DAY = 86_400_000;
const interval = (f: MonitorRow["frequency"]) => (f === "daily" ? DAY : 7 * DAY);

type Purpose = "confirm" | "manage";

export function monitorToken(id: string, p: Purpose): string {
  return sign({ m: id, p }, p === "confirm" ? 7 * 86_400 : undefined);
}

export function readMonitorToken(token: string | null | undefined, p: Purpose): string | null {
  const payload = verify<{ m: string; p: Purpose }>(token);
  return payload && payload.p === p ? payload.m : null;
}

export const manageUrl = (id: string) => `${appUrl()}/monitors/manage?token=${monitorToken(id, "manage")}`;
export const unsubscribeUrl = (id: string) => `${appUrl()}/unsubscribe?token=${monitorToken(id, "manage")}`;

export async function getMonitor(id: string): Promise<MonitorRow | undefined> {
  const db = await getDb();
  const [m] = await db.select().from(monitors).where(eq(monitors.id, id)).limit(1);
  return m;
}

/** Creates (or updates) a monitor and sends the double opt-in email. */
export async function subscribe(p: {
  email: string;
  url: string;
  frequency: MonitorRow["frequency"];
  baselineAuditId: string;
}): Promise<{ monitor: MonitorRow; confirmationSent: boolean }> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.email, p.email), eq(monitors.url, p.url)))
    .limit(1);

  let monitor: MonitorRow;
  if (existing) {
    [monitor] = await db
      .update(monitors)
      .set({ frequency: p.frequency, active: true })
      .where(eq(monitors.id, existing.id))
      .returning();
  } else {
    [monitor] = await db
      .insert(monitors)
      .values({
        id: nanoid(14),
        email: p.email,
        url: p.url,
        frequency: p.frequency,
        lastAuditId: p.baselineAuditId,
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + interval(p.frequency)),
      })
      .returning();
  }

  if (monitor.confirmedAt) return { monitor, confirmationSent: false };
  await sendEmail(
    confirmMonitorEmail({
      to: p.email,
      host: new URL(p.url).host,
      frequency: p.frequency,
      confirmUrl: `${appUrl()}/api/monitors/confirm?token=${monitorToken(monitor.id, "confirm")}`,
    }),
  );
  return { monitor, confirmationSent: true };
}

export async function confirm(id: string): Promise<MonitorRow | undefined> {
  const db = await getDb();
  const [m] = await db
    .update(monitors)
    .set({ confirmedAt: new Date(), active: true })
    .where(eq(monitors.id, id))
    .returning();
  return m;
}

export async function updateMonitor(
  id: string,
  change: { frequency?: MonitorRow["frequency"]; active?: boolean },
): Promise<MonitorRow | undefined> {
  const db = await getDb();
  const [m] = await db.update(monitors).set(change).where(eq(monitors.id, id)).returning();
  return m;
}

export async function deleteMonitor(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(monitors).where(eq(monitors.id, id));
}

export async function recentMonitorAudits(id: string, n = 10): Promise<AuditRow[]> {
  const db = await getDb();
  return db.select().from(audits).where(eq(audits.monitorId, id)).orderBy(desc(audits.createdAt)).limit(n);
}

/** Compares two audits and returns what got worse. */
export function diffAudits(prev: AuditRow | undefined, next: AuditRow): AlertItem[] {
  const out: AlertItem[] = [];
  if (next.status === "failed") {
    return [{ kind: "down", title: "Site is unreachable", detail: next.error ?? "We could not load the homepage." }];
  }
  const now = new Map(next.findings.map((f) => [f.id, f]));
  const before = new Map((prev?.findings ?? []).map((f) => [f.id, f]));

  const cert = now.get("cert-expiry");
  if (cert && cert.status === "fail") out.push({ kind: "ssl-expiry", title: "SSL certificate expiring", detail: cert.summary });
  const certValid = now.get("cert-valid");
  if (certValid?.status === "fail") out.push({ kind: "ssl-invalid", title: "SSL certificate invalid", detail: certValid.summary });

  const watched: Record<string, string> = {
    "sitemap": "Sitemap missing",
    "robots-txt": "robots.txt problem",
    "indexable": "Homepage set to noindex",
    "https": "HTTPS lost",
    "http-redirect": "HTTP no longer redirects to HTTPS",
  };
  const isNewFail = (f: Finding) => f.status === "fail" && before.get(f.id)?.status !== "fail" && prev?.status === "done";

  for (const f of now.values()) {
    if (!isNewFail(f)) continue;
    if (f.category === "exposure") out.push({ kind: `exposed:${f.id}`, title: "New exposed file", detail: `${f.title}: ${f.summary}${f.evidence ? `\n${f.evidence}` : ""}` });
    else if (watched[f.id]) out.push({ kind: `regressed:${f.id}`, title: watched[f.id], detail: f.summary });
    else if (f.category === "security") out.push({ kind: `regressed:${f.id}`, title: `Security regression: ${f.title}`, detail: f.summary });
  }

  if (prev?.score != null && next.score != null && prev.score - next.score >= 10) {
    out.push({ kind: "score-drop", title: `Score dropped ${prev.score - next.score} points`, detail: `${prev.score} → ${next.score}` });
  }
  return out;
}

async function recentlyAlerted(monitorId: string, kind: string): Promise<boolean> {
  const db = await getDb();
  const [r] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.monitorId, monitorId), eq(alerts.kind, kind), gt(alerts.sentAt, new Date(Date.now() - 20 * 3_600_000))))
    .limit(1);
  return !!r;
}

export async function runMonitor(m: MonitorRow): Promise<{ alerts: number }> {
  const db = await getDb();
  // Claim the monitor first so an overlapping cron run does not pick it up again.
  await db
    .update(monitors)
    .set({ lastRunAt: new Date(), nextRunAt: new Date(Date.now() + interval(m.frequency)) })
    .where(eq(monitors.id, m.id));

  const row = await createAudit({ url: m.url, monitorId: m.id });
  const next = (await executeAudit(row.id))!;
  const prev = m.lastAuditId ? await getAudit(m.lastAuditId) : undefined;

  const found = diffAudits(prev, next);
  const fresh: AlertItem[] = [];
  for (const a of found) if (!(await recentlyAlerted(m.id, a.kind))) fresh.push(a);

  const shouldEmail = fresh.length > 0 || m.frequency === "weekly";
  if (shouldEmail) {
    await sendEmail(
      monitorEmail({
        to: m.email,
        host: new URL(m.url).host,
        auditId: next.id,
        score: next.score ?? undefined,
        grade: next.grade ?? undefined,
        previousScore: prev?.score,
        alerts: fresh,
        findings: next.findings,
        manageUrl: manageUrl(m.id),
        unsubscribeUrl: unsubscribeUrl(m.id),
      }),
    );
  }
  if (fresh.length) {
    await db.insert(alerts).values(
      fresh.map((a) => ({ id: nanoid(14), monitorId: m.id, auditId: next.id, kind: a.kind, payload: { title: a.title, detail: a.detail } })),
    );
  }
  // Keep the last good audit as the baseline so one outage does not reset the diff.
  if (next.status === "done") await db.update(monitors).set({ lastAuditId: next.id }).where(eq(monitors.id, m.id));
  return { alerts: fresh.length };
}

export async function dueMonitors(limit: number = limits.monitorBatchSize): Promise<MonitorRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(monitors)
    .where(and(eq(monitors.active, true), isNotNull(monitors.confirmedAt), lte(monitors.nextRunAt, new Date())))
    .orderBy(asc(monitors.nextRunAt))
    .limit(limit);
}
