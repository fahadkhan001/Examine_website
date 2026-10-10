import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson, zodMessage } from "@/lib/server/http";
import { deleteMonitor, readMonitorToken, updateMonitor } from "@/lib/server/monitoring";

const Body = z.object({
  token: z.string().min(1),
  action: z.enum(["frequency", "pause", "resume", "delete"]),
  frequency: z.enum(["daily", "weekly"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const id = readMonitorToken(parsed.data.token, "manage");
  if (!id) return jsonError("This link is invalid", 401);
  const { action, frequency } = parsed.data;
  if (action === "delete") {
    await deleteMonitor(id);
    return NextResponse.json({ ok: true, deleted: true });
  }
  const m = await updateMonitor(
    id,
    action === "frequency" && frequency ? { frequency } : { active: action === "resume" },
  );
  if (!m) return jsonError("Monitor not found", 404);
  return NextResponse.json({ ok: true, frequency: m.frequency, active: m.active });
}
