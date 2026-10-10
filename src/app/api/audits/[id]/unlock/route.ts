import { NextResponse } from "next/server";
import { z } from "zod";
import { getAudit, toClientAudit } from "@/lib/server/audits";
import { jsonError, readJson, zodMessage } from "@/lib/server/http";
import { recordLeadForAudit } from "@/lib/server/leads";
import { setLeadSession } from "@/lib/server/session";
import { clientIp } from "@/lib/server/tokens";
import { verifyTurnstile } from "@/lib/server/turnstile";

const Body = z.object({
  email: z.email("Enter a valid email address").max(254).transform((e) => e.toLowerCase().trim()),
  name: z.string().trim().max(120).optional().transform((v) => v || undefined),
  company: z.string().trim().max(160).optional().transform((v) => v || undefined),
  consent: z.boolean().optional().default(false),
  turnstileToken: z.string().optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/audits/[id]/unlock">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  if (!(await verifyTurnstile(parsed.data.turnstileToken, clientIp(req.headers)))) {
    return jsonError("Bot check failed. Refresh the page and try again.", 403);
  }
  const row = await getAudit(id);
  if (!row) return jsonError("Report not found", 404);

  const { email, name, company, consent } = parsed.data;
  const lead = { email, name, company, consent };
  await recordLeadForAudit(lead, row.id);
  await setLeadSession(lead);
  return NextResponse.json(toClientAudit(row, true));
}
