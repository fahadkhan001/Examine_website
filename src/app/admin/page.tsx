import type { Metadata } from "next";
import Link from "next/link";
import { button, cx } from "@/components/ui";
import { adminOverview } from "@/lib/server/admin";
import { listLeads } from "@/lib/server/leads";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function AdminPage() {
  const [{ stats, recentAudits, monitors }, leads] = await Promise.all([adminOverview(), listLeads(200)]);
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <a href="/api/admin/leads" className={button.secondary}>Export leads CSV</a>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Audits", stats.audits],
          ["Audits, last 7 days", stats.audits7d],
          ["Leads", stats.leads],
          ["Active monitors", stats.activeMonitors],
        ].map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-line bg-raised p-4">
            <p className="text-[13px] text-muted">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{n}</p>
          </div>
        ))}
      </section>

      <Table title={`Leads (${leads.length})`} head={["Email", "Name", "Company", "Site", "Score", "Opt-in", "Date"]}>
        {leads.map((l) => (
          <tr key={l.id}>
            <td className="font-medium">{l.email}</td>
            <td>{l.name ?? "–"}</td>
            <td>{l.company ?? "–"}</td>
            <td><Link className="underline decoration-line-strong underline-offset-2 hover:decoration-ink" href={`/r/${l.auditId}`}>{l.host}</Link></td>
            <td className="font-mono">{l.score ?? "–"} {l.grade}</td>
            <td>{l.consentMarketing ? "yes" : "no"}</td>
            <td className="font-mono text-muted">{fmt(l.createdAt)}</td>
          </tr>
        ))}
      </Table>

      <Table title={`Monitors (${monitors.length})`} head={["Site", "Email", "Frequency", "Status", "Next run"]}>
        {monitors.map((m) => (
          <tr key={m.id}>
            <td className="font-medium">{new URL(m.url).host}</td>
            <td>{m.email}</td>
            <td className="capitalize">{m.frequency}</td>
            <td>
              <span className={cx("rounded-full px-2 py-0.5 font-mono text-xs", m.active && m.confirmedAt ? "bg-accent-soft text-pass" : "bg-sunken text-muted")}>
                {!m.confirmedAt ? "unconfirmed" : m.active ? "active" : "paused"}
              </span>
            </td>
            <td className="font-mono text-muted">{fmt(m.nextRunAt)}</td>
          </tr>
        ))}
      </Table>

      <Table title="Recent audits" head={["Site", "Status", "Score", "Source", "Date"]}>
        {recentAudits.map((a) => (
          <tr key={a.id}>
            <td><Link className="font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink" href={`/r/${a.id}`}>{a.host}</Link></td>
            <td>{a.status}</td>
            <td className="font-mono">{a.score ?? "–"} {a.grade}</td>
            <td>{a.monitorId ? "monitor" : "web"}</td>
            <td className="font-mono text-muted">{fmt(a.createdAt)}</td>
          </tr>
        ))}
      </Table>
    </main>
  );
}

function Table({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full text-left text-sm [&_td]:whitespace-nowrap [&_td]:px-4 [&_td]:py-2.5 [&_tr+tr]:border-t [&_tr+tr]:border-line">
          <thead className="border-b border-line bg-sunken/50 text-[12px] uppercase tracking-wider text-muted">
            <tr>{head.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
