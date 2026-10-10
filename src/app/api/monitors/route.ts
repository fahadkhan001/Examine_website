import { NextResponse } from "next/server";
import { z } from "zod";
import { getAudit } from "@/lib/server/audits";
import { jsonError, readJson, zodMessage } from "@/lib/server/http";
import { subscribe } from "@/lib/server/monitoring";
import { getLeadSession } from "@/lib/server/session";

const Body = z.object({
  auditId: z.string().min(1).max(40),
  frequency: z.enum(["daily", "weekly"]),
});

/** Subscribe the unlocked visitor to monitoring of the audited site. */
export async function POST(req: Request) {
  const lead = await getLeadSession();
  if (!lead) return jsonError("Unlock the report first", 401);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const audit = await getAudit(parsed.data.auditId);
  if (!audit || audit.status !== "done") return jsonError("Report not found", 404);

  const { monitor, confirmationSent } = await subscribe({
    email: lead.email,
    url: audit.url,
    frequency: parsed.data.frequency,
    baselineAuditId: audit.id,
  });
  return NextResponse.json({
    ok: true,
    email: lead.email,
    frequency: monitor.frequency,
    confirmed: !!monitor.confirmedAt,
    confirmationSent,
  });
}
