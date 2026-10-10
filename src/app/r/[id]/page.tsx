import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { getAudit, toClientAudit } from "@/lib/server/audits";
import { recordLeadForAudit } from "@/lib/server/leads";
import { getLeadSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await getAudit(id);
  if (!row) return { title: "Report not found" };
  const title = row.status === "done" ? `${row.host}: ${row.score}/100 (${row.grade})` : `Examining ${row.host}`;
  return { title, robots: { index: false, follow: false } };
}

export default async function ReportPage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const row = await getAudit(id);
  if (!row) notFound();
  const lead = await getLeadSession();
  if (lead && row.status === "done") await recordLeadForAudit(lead, row.id);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <ReportView key={row.id} initial={toClientAudit(row, !!lead)} />
    </main>
  );
}
