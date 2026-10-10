import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson, zodMessage } from "@/lib/server/http";
import { resolveTarget, startAudits } from "@/lib/server/start-audit";
import { clientIp, hashIp } from "@/lib/server/tokens";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const maxDuration = 60;

const Body = z.object({
  url: z.string().min(1, "Enter a website address").max(2048),
  turnstileToken: z.string().optional(),
  /** Skip the 10-minute cache (re-scan after fixing something). */
  fresh: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const t = resolveTarget(parsed.data.url);
  if ("error" in t) return jsonError(t.error, t.status);

  const ip = clientIp(req.headers);
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return jsonError("Bot check failed. Refresh the page and try again.", 403);
  }
  const started = await startAudits([t.target], hashIp(ip), parsed.data.fresh);
  if ("error" in started) return jsonError(started.error, started.status);
  const [{ id, cached }] = started;
  return NextResponse.json({ id, cached }, { status: cached ? 200 : 201 });
}
