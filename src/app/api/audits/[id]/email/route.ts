import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { reportEmail } from "@/lib/email/templates";
import { getAudit } from "@/lib/server/audits";
import { jsonError } from "@/lib/server/http";
import { getLeadSession } from "@/lib/server/session";

export async function POST(_req: Request, ctx: RouteContext<"/api/audits/[id]/email">) {
  const { id } = await ctx.params;
  const lead = await getLeadSession();
  if (!lead) return jsonError("Unlock the report first", 401);
  const row = await getAudit(id);
  if (!row || row.status !== "done" || row.score === null || !row.grade) return jsonError("Report not ready", 404);
  await sendEmail(
    reportEmail({ to: lead.email, auditId: row.id, host: row.host, score: row.score, grade: row.grade, findings: row.findings }),
  );
  return NextResponse.json({ ok: true, to: lead.email });
}
