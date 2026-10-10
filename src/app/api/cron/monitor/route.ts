import { after, NextResponse, type NextRequest } from "next/server";
import { limits } from "@/lib/config";
import { dueMonitors, getMonitor, runMonitor } from "@/lib/server/monitoring";

export const maxDuration = 60;

/**
 * Vercel Cron calls this daily with "Authorization: Bearer $CRON_SECRET".
 * Each invocation audits one small batch in parallel (fits the 60s limit),
 * then re-invokes itself while more monitors are due.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ?monitor=<id> runs one monitor now, ignoring its schedule (ops / testing).
  const only = req.nextUrl.searchParams.get("monitor");
  if (only) {
    const m = await getMonitor(only);
    if (!m) return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    return NextResponse.json(await runMonitor(m));
  }

  const batch = await dueMonitors(limits.monitorBatchSize);
  const results = await Promise.allSettled(batch.map((m) => runMonitor(m)));
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.error("monitor run failed", (f as PromiseRejectedResult).reason);

  const more = batch.length === limits.monitorBatchSize && (await dueMonitors(1)).length > 0;
  if (more) {
    after(() =>
      fetch(req.nextUrl.toString(), { headers: { authorization: `Bearer ${secret}` } }).catch((e) =>
        console.error("cron chain failed", e),
      ),
    );
  }
  return NextResponse.json({
    processed: batch.length,
    alerts: results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.alerts : 0), 0),
    failed: failed.length,
    more,
  });
}
