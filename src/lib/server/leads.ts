import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/client";
import { audits, leads } from "@/lib/db/schema";
import type { LeadSession } from "./session";

/** Idempotent: one row per (email, audit). */
export async function recordLeadForAudit(lead: LeadSession, auditId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(leads)
    .values({
      id: nanoid(14),
      email: lead.email,
      name: lead.name,
      company: lead.company,
      consentMarketing: !!lead.consent,
      auditId,
    })
    .onConflictDoNothing();
}

export async function listLeads(limit = 1000) {
  const db = await getDb();
  return db
    .select({
      id: leads.id,
      email: leads.email,
      name: leads.name,
      company: leads.company,
      consentMarketing: leads.consentMarketing,
      createdAt: leads.createdAt,
      auditId: leads.auditId,
      host: audits.host,
      score: audits.score,
      grade: audits.grade,
    })
    .from(leads)
    .innerJoin(audits, eq(audits.id, leads.auditId))
    .orderBy(desc(leads.createdAt))
    .limit(limit);
}
