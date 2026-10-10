import { renderReportPdf } from "@/lib/pdf/report";
import { getAudit } from "@/lib/server/audits";
import { jsonError } from "@/lib/server/http";
import { getLeadSession } from "@/lib/server/session";

export const maxDuration = 30;

export async function GET(_req: Request, ctx: RouteContext<"/api/audits/[id]/pdf">) {
  const { id } = await ctx.params;
  const row = await getAudit(id);
  if (!row || row.status !== "done") return jsonError("Report not ready", 404);
  if (!(await getLeadSession())) return jsonError("Unlock the report to download the PDF", 401);
  const pdf = await renderReportPdf(row);
  const date = (row.finishedAt ?? row.createdAt).toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="examweb-${row.host.replace(/[^a-z0-9.-]/gi, "")}-${date}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
