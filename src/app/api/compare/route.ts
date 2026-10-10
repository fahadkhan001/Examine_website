import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson, zodMessage } from "@/lib/server/http";
import { resolveTarget, startAudits } from "@/lib/server/start-audit";
import { clientIp, hashIp } from "@/lib/server/tokens";
import { verifyTurnstile } from "@/lib/server/turnstile";

// Both audits run in after() callbacks of this one request.
export const maxDuration = 60;

const Body = z.object({
  a: z.string().min(1, "Enter the first website").max(2048),
  b: z.string().min(1, "Enter the second website").max(2048),
  turnstileToken: z.string().optional(),
  fresh: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const a = resolveTarget(parsed.data.a);
  if ("error" in a) return jsonError(`Site A: ${a.error}`, a.status);
  const b = resolveTarget(parsed.data.b);
  if ("error" in b) return jsonError(`Site B: ${b.error}`, b.status);
  if (a.target === b.target) return jsonError("Enter two different websites to compare.");

  const ip = clientIp(req.headers);
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return jsonError("Bot check failed. Refresh the page and try again.", 403);
  }
  const started = await startAudits([a.target, b.target], hashIp(ip), parsed.data.fresh);
  if ("error" in started) return jsonError(started.error, started.status);
  return NextResponse.json({ a: started[0].id, b: started[1].id }, { status: 201 });
}
