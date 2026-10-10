import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareView } from "@/components/CompareView";
import { getAudit, toClientAudit } from "@/lib/server/audits";
import { recordLeadForAudit } from "@/lib/server/leads";
import { getLeadSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/compare/[a]/[b]">): Promise<Metadata> {
  const { a, b } = await params;
  const [ra, rb] = await Promise.all([getAudit(a), getAudit(b)]);
  if (!ra || !rb) return { title: "Comparison not found" };
  return { title: `${ra.host} vs ${rb.host}`, robots: { index: false, follow: false } };
}

export default async function ComparisonPage({ params }: PageProps<"/compare/[a]/[b]">) {
  const { a, b } = await params;
  const [ra, rb] = await Promise.all([getAudit(a), getAudit(b)]);
  if (!ra || !rb) notFound();
  const lead = await getLeadSession();
  if (lead) {
    await Promise.all([ra, rb].filter((r) => r.status === "done").map((r) => recordLeadForAudit(lead, r.id)));
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <CompareView key={`${a}-${b}`} initialA={toClientAudit(ra, !!lead)} initialB={toClientAudit(rb, !!lead)} />
    </main>
  );
}
