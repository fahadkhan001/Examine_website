import type { Metadata } from "next";
import Link from "next/link";
import { ManageMonitor } from "@/components/ManageMonitor";
import { button } from "@/components/ui";
import { brand } from "@/lib/config";
import { getMonitor, readMonitorToken, recentMonitorAudits } from "@/lib/server/monitoring";

export const metadata: Metadata = { title: "Manage monitoring", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ManagePage({ searchParams }: PageProps<"/monitors/manage">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : undefined;
  const id = readMonitorToken(token, "manage");
  const monitor = id ? await getMonitor(id) : undefined;

  if (!monitor || !token) {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Link not valid</h1>
        <p className="mt-2 text-muted">
          {sp.error === "expired" ? "This confirmation link has expired. Start monitoring again from any report." : "This monitor no longer exists or the link is incomplete."}
        </p>
        <Link href="/" className={`${button.primary} mt-6`}>Go to {brand.name}</Link>
      </main>
    );
  }
  const history = await recentMonitorAudits(monitor.id, 8);

  return (
    <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      {sp.confirmed === "1" && (
        <p className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-sm" role="status">
          Monitoring confirmed. We will email {monitor.email} when something changes.
        </p>
      )}
      <p className="font-mono text-xs uppercase tracking-wider text-muted">Monitoring</p>
      <h1 className="mt-1 break-all text-3xl font-semibold tracking-tight">{new URL(monitor.url).host}</h1>
      <p className="mt-1 text-sm text-muted">Alerts go to {monitor.email}</p>

      <ManageMonitor
        token={token}
        initial={{ frequency: monitor.frequency, active: monitor.active, confirmed: !!monitor.confirmedAt }}
        nextRunAt={monitor.nextRunAt.toISOString()}
      />

      <h2 className="mt-12 text-sm font-semibold">Recent checks</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No scheduled checks yet. The first one runs on the next schedule.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-raised">
          {history.map((a) => (
            <li key={a.id}>
              <Link href={`/r/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm transition hover:bg-sunken">
                <span className="text-ink-2">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                <span className="font-mono font-semibold">{a.status === "done" ? `${a.score} · ${a.grade}` : a.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
