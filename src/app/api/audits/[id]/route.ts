import { NextResponse } from "next/server";
import { getAudit, toClientAudit } from "@/lib/server/audits";
import { jsonError } from "@/lib/server/http";
import { recordLeadForAudit } from "@/lib/server/leads";
import { getLeadSession } from "@/lib/server/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/audits/[id]">) {
  const { id } = await ctx.params;
  const row = await getAudit(id);
  if (!row) return jsonError("Report not found", 404);
  const lead = await getLeadSession();
  if (lead && row.status === "done") await recordLeadForAudit(lead, row.id);
  return NextResponse.json(toClientAudit(row, !!lead), {
    headers: { "cache-control": "no-store" },
  });
}
