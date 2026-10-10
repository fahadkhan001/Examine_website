import { listLeads } from "@/lib/server/leads";

/** CSV export. Protected by the admin basic-auth proxy. */
export async function GET() {
  const rows = await listLeads(10_000);
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote, and neutralize spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["email", "name", "company", "marketing_consent", "site", "score", "grade", "report_id", "created_at"];
  const lines = rows.map((r) =>
    [r.email, r.name, r.company, r.consentMarketing, r.host, r.score, r.grade, r.auditId, r.createdAt.toISOString()]
      .map(cell)
      .join(","),
  );
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="examweb-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
