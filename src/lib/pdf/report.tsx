import { Circle, Document, Font, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { buildInsights } from "@/lib/audit/insights";
import { CATEGORY_META, SEVERITY_ORDER, type Finding, type Grade } from "@/lib/audit/types";
import { appUrl, brand } from "@/lib/config";
import type { AuditRow } from "@/lib/db/schema";

const INK = "#0B0D10";
const MUTED = "#6B6F76";
const LINE = "#E6E6E2";
const ACCENT = "#1FB866";
const GRADE: Record<Grade, string> = { A: "#1A9F5B", B: "#5A9E1A", C: "#C98A00", D: "#D9620F", F: "#D23C41" };
/** Built-in PDF fonts only cover WinAnsi; swap the few glyphs we use that it lacks. */
const safe = (t: string) => t.replace(/→/g, "->").replace(/[^\x00-\xFF•…–—‘’“”€™]/g, "?");

const SEV = { critical: "#D23C41", high: "#D9620F", medium: "#C98A00", low: "#3E63DD" } as const;

// Long unbroken strings (URLs, query strings) crash the default hyphenator in
// narrow columns. Offer a break point every 16 characters instead.
Font.registerHyphenationCallback((word) => (word.length > 16 ? word.match(/.{1,16}/g) ?? [word] : [word]));

/** Column widths for the pages table (A4 content width ~515pt). */
const COLS = [190, 38, 140, 62, 25, 60];

// No page-level lineHeight: with a fixed footer it crashes react-pdf layout on long reports.
const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: INK },
  brand: { fontFamily: "Courier", fontWeight: 700, fontSize: 11, letterSpacing: -0.3 },
  muted: { color: MUTED },
  h1: { fontFamily: "Helvetica", fontWeight: 700, fontSize: 24, letterSpacing: -0.5, marginTop: 6, lineHeight: 1.2 },
  h2: { fontFamily: "Helvetica", fontWeight: 700, fontSize: 14, marginBottom: 8, marginTop: 4 },
  mono: { fontFamily: "Courier", fontSize: 8.5 },
  row: { flexDirection: "row", alignItems: "center" },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 12, marginBottom: 8 },
  chip: { fontFamily: "Helvetica", fontWeight: 700, fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: "#FFFFFF", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, marginRight: 8 },
  code: { fontFamily: "Courier", fontSize: 8, backgroundColor: "#F4F4F2", padding: 8, borderRadius: 4, marginTop: 6 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED },
});

function arcPath(cx: number, cy: number, r: number, fraction: number): string {
  // SVG arc from 12 o'clock, clockwise. A full circle needs two arcs.
  const f = Math.min(Math.max(fraction, 0), 0.9999);
  const a = f * 2 * Math.PI;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

function ScoreRing({ score, grade }: { score: number; grade: Grade }) {
  return (
    <View style={{ width: 130, height: 130, position: "relative" }}>
      <Svg width={130} height={130} viewBox="0 0 130 130">
        <Circle cx={65} cy={65} r={52} stroke={LINE} strokeWidth={10} fill="none" />
        {score > 0 ? <Path d={arcPath(65, 65, 52, score / 100)} stroke={GRADE[grade]} strokeWidth={10} fill="none" strokeLinecap="round" /> : null}
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, width: 130, height: 130, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: "Helvetica", fontWeight: 700, fontSize: 38, lineHeight: 1, color: GRADE[grade] }}>{grade}</Text>
        <Text style={{ fontSize: 10, lineHeight: 1, marginTop: 4, color: MUTED }}>{score}/100</Text>
      </View>
    </View>
  );
}

function Footer({ host }: { host: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        {brand.name} · {host}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <View style={s.card} minPresenceAhead={60}>
      <View style={s.row}>
        <Text style={{ ...s.chip, backgroundColor: f.status === "fail" ? SEV[f.severity] : "#9A9DA3" }}>
          {f.status === "fail" ? f.severity : "warning"}
        </Text>
        <Text style={{ fontFamily: "Helvetica", fontWeight: 700, fontSize: 11, flex: 1 }}>{f.title}</Text>
        <Text style={{ ...s.muted, fontSize: 8 }}>{CATEGORY_META[f.category].label}</Text>
      </View>
      <Text style={{ marginTop: 4, lineHeight: 1.4 }}>{safe(f.summary)}</Text>
      {f.evidence ? <Text style={{ ...s.mono, color: MUTED, marginTop: 4 }}>{safe(f.evidence.slice(0, 600))}</Text> : null}
      <Text style={{ marginTop: 6, lineHeight: 1.4 }}>
        <Text style={{ fontFamily: "Helvetica", fontWeight: 700 }}>Why it matters. </Text>
        {f.whyItMatters}
      </Text>
      <Text style={{ marginTop: 4, lineHeight: 1.4 }}>
        <Text style={{ fontFamily: "Helvetica", fontWeight: 700 }}>How to fix. </Text>
        {f.howToFix}
      </Text>
      {f.fixSnippet ? <Text style={s.code}>{safe(f.fixSnippet)}</Text> : null}
    </View>
  );
}

function ReportDocument({ audit }: { audit: AuditRow }) {
  const issues = audit.findings
    .filter((f) => f.status === "fail" || f.status === "warn")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "fail" ? -1 : 1) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const passed = audit.findings.filter((f) => f.status === "pass");
  const date = (audit.finishedAt ?? audit.createdAt).toISOString().slice(0, 10);
  const counts = (["critical", "high", "medium", "low"] as const).map((sev) => ({
    sev,
    n: issues.filter((f) => f.severity === sev).length,
  }));

  return (
    <Document title={`${brand.name} report — ${audit.host}`} author={brand.name}>
      <Page size="A4" style={s.page}>
        <View style={{ ...s.row, justifyContent: "space-between", marginBottom: 36 }}>
          <View style={s.row}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, marginRight: 6 }} />
            <Text style={s.brand}>{brand.name}</Text>
          </View>
          <Text style={{ ...s.muted, fontSize: 9 }}>Website audit · {date}</Text>
        </View>

        <Text style={{ ...s.mono, fontSize: 10, color: MUTED }}>{audit.finalUrl ?? audit.url}</Text>
        <Text style={s.h1}>{safe(audit.pageTitle || audit.host)}</Text>

        <View style={{ ...s.row, marginTop: 24, marginBottom: 24 }}>
          <ScoreRing score={audit.score ?? 0} grade={audit.grade ?? "F"} />
          <View style={{ marginLeft: 28, flex: 1 }}>
            {counts.map(({ sev, n }) => (
              <View key={sev} style={{ ...s.row, marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: SEV[sev], marginRight: 8 }} />
                <Text style={{ width: 60, textTransform: "capitalize" }}>{sev}</Text>
                <Text style={{ fontFamily: "Helvetica", fontWeight: 700 }}>{n}</Text>
              </View>
            ))}
            <View style={{ ...s.row, marginTop: 2 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: ACCENT, marginRight: 8 }} />
              <Text style={{ width: 60 }}>Passed</Text>
              <Text style={{ fontFamily: "Helvetica", fontWeight: 700 }}>{passed.length}</Text>
            </View>
          </View>
        </View>

        <Text style={s.h2}>Category scores</Text>
        {(audit.categoryScores ?? []).map((c) => (
          <View key={c.category} style={{ ...s.row, marginBottom: 7 }}>
            <Text style={{ width: 120 }}>{CATEGORY_META[c.category].label}</Text>
            <View style={{ flex: 1, height: 6, backgroundColor: "#EFEFEC", borderRadius: 3 }}>
              <View
                style={{
                  width: `${c.score ?? 0}%`,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: (c.score ?? 0) >= 90 ? ACCENT : (c.score ?? 0) >= 70 ? "#C98A00" : "#D23C41",
                }}
              />
            </View>
            <Text style={{ width: 36, textAlign: "right", fontFamily: "Helvetica", fontWeight: 700 }}>{c.score ?? "–"}</Text>
          </View>
        ))}

        {audit.speedNote ? (
          <Text style={{ ...s.muted, fontSize: 8.5, marginTop: 10 }}>
            Note: Google PageSpeed data was unavailable for this scan ({safe(audit.speedNote)}). Speed scores marked n/a.
          </Text>
        ) : null}

        <Text style={{ ...s.h2, marginTop: 20 }}>Key insights</Text>
        {buildInsights(audit.findings, audit.pages).map((ins, n) => (
          <View key={ins.headline} style={{ flexDirection: "row", marginBottom: 7 }} wrap={false}>
            <Text style={{ ...s.mono, width: 18, color: MUTED }}>{String(n + 1).padStart(2, "0")}</Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, marginRight: 7, backgroundColor: ins.tone === "bad" ? SEV.critical : ins.tone === "warn" ? SEV.medium : ACCENT }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Helvetica", fontWeight: 700, fontSize: 10.5 }}>{safe(ins.headline)}</Text>
              <Text style={{ ...s.muted, fontSize: 9, lineHeight: 1.35, marginTop: 1 }}>{safe(ins.detail)}</Text>
            </View>
          </View>
        ))}
        <Footer host={audit.host} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Issues to fix ({issues.length})</Text>
        {issues.length ? issues.map((f) => <FindingCard key={f.id} f={f} />) : <Text>No issues found.</Text>}

        <Text style={{ ...s.h2, marginTop: 16 }}>Passed checks ({passed.length})</Text>
        {passed.map((f) => (
          <View key={f.id} style={{ ...s.row, marginBottom: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginRight: 8 }} />
            <Text style={{ width: 200 }}>{f.title}</Text>
            <Text style={{ ...s.muted, flex: 1 }}>{safe(f.summary)}</Text>
          </View>
        ))}
        <Text style={{ ...s.muted, marginTop: 20, fontSize: 8 }}>
          Generated by {brand.name} ({appUrl()}). Automated, read-only checks of public URLs; results are a snapshot at
          the time of the scan.
        </Text>
        <Footer host={audit.host} />
      </Page>
      {audit.pages.length > 1 ? (
        <Page size="A4" style={s.page}>
          <View>
            <Text style={s.h2}>Pages scanned ({audit.pages.length})</Text>
            <View style={{ ...s.row, borderBottomWidth: 1, borderColor: LINE, paddingBottom: 4, marginBottom: 2 }}>
              {["Route", "Status", "Title", "Description", "H1", "Response"].map((h, i) => (
                <Text key={h} style={{ ...s.muted, fontSize: 7.5, width: COLS[i], textTransform: "uppercase" }}>{h}</Text>
              ))}
            </View>
            {audit.pages.map((p) => {
              const ok = !p.error && (p.status ?? 0) < 400;
              const route = (() => {
                try {
                  const u = new URL(p.url);
                  return u.pathname + u.search;
                } catch {
                  return p.url;
                }
              })();
              return (
                <View key={p.url} style={{ ...s.row, paddingVertical: 3, borderBottomWidth: 0.5, borderColor: LINE }} wrap={false}>
                  <Text style={{ ...s.mono, width: COLS[0] }}>{safe(route.slice(0, 60))}{p.redirects ? " ->" : ""}</Text>
                  <Text style={{ width: COLS[1], color: ok ? (p.redirects ? SEV.medium : INK) : SEV.critical }}>{p.error ? "error" : p.status}</Text>
                  <Text style={{ width: COLS[2], color: p.title ? INK : SEV.critical, fontSize: 8 }}>{ok ? (p.title ? safe(p.title.slice(0, 48)) : "missing") : "-"}</Text>
                  <Text style={{ width: COLS[3], color: !ok ? MUTED : !p.description ? SEV.critical : INK, fontSize: 8 }}>
                    {ok ? (p.description ? `${p.description.length} chars` : "missing") : "-"}
                  </Text>
                  <Text style={{ width: COLS[4], color: ok && p.h1Count !== 1 ? SEV.medium : INK }}>{ok ? p.h1Count ?? "-" : "-"}</Text>
                  <Text style={{ width: COLS[5], color: (p.ttfbMs ?? 0) > 1500 ? SEV.critical : INK }}>{p.ttfbMs !== undefined ? `${p.ttfbMs} ms` : "-"}</Text>
                </View>
              );
            })}
          </View>
          <Footer host={audit.host} />
        </Page>
      ) : null}
    </Document>
  );
}

export function renderReportPdf(audit: AuditRow): Promise<Buffer> {
  return renderToBuffer(<ReportDocument audit={audit} />);
}
