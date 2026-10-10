import { after } from "next/server";
import { BlockedTargetError, normalizeInputUrl } from "@/lib/audit/safe-fetch";
import { limits } from "@/lib/config";
import { countRecentByIp, createAudit, executeAudit, findRecentAudit } from "./audits";

export type Started = { id: string; cached: boolean };
export type StartError = { error: string; status: number };

/** User input → the site root we audit (a deep link still audits the whole site). */
export function resolveTarget(input: string): { target: string } | StartError {
  try {
    return { target: `${normalizeInputUrl(input).origin}/` };
  } catch (e) {
    return { error: e instanceof BlockedTargetError ? e.message : "Invalid URL", status: 400 };
  }
}

/**
 * Starts (or reuses cached) audits for the given site roots. Rate limits count
 * only the audits that actually start, and all of them must fit, so a
 * comparison never ends up half-started.
 */
export async function startAudits(targets: string[], ipHash: string, fresh = false): Promise<Started[] | StartError> {
  const cached = await Promise.all(targets.map((t) => (fresh ? undefined : findRecentAudit(t))));
  const toStart = cached.filter((c) => !c).length;
  if (toStart > 0) {
    const [hour, day] = await Promise.all([countRecentByIp(ipHash, 3_600_000), countRecentByIp(ipHash, 86_400_000)]);
    if (hour + toStart > limits.scansPerHour || day + toStart > limits.scansPerDay) {
      return {
        error: `You have reached the free limit (${limits.scansPerHour} scans per hour, ${limits.scansPerDay} per day). Try again later.`,
        status: 429,
      };
    }
  }
  const out: Started[] = [];
  for (let i = 0; i < targets.length; i++) {
    const c = cached[i];
    if (c) {
      out.push({ id: c.id, cached: true });
      continue;
    }
    const row = await createAudit({ url: targets[i], ipHash });
    after(() => executeAudit(row.id));
    out.push({ id: row.id, cached: false });
  }
  return out;
}
