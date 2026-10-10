import { appUrl, brand } from "@/lib/config";
import { buildInsights } from "@/lib/audit/insights";
import type { Finding, Grade } from "@/lib/audit/types";
import { SEVERITY_ORDER } from "@/lib/audit/types";
import type { Email } from "./index";

/** Plain HTML emails with inline styles: they render in Gmail, Outlook and Apple Mail. */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const GRADE_COLOR: Record<Grade, string> = { A: "#1a9f5b", B: "#5a9e1a", C: "#c98a00", D: "#d9620f", F: "#d23c41" };
const SEV_COLOR = { critical: "#d23c41", high: "#d9620f", medium: "#c98a00", low: "#3e63dd" } as const;

function layout(opts: { preheader: string; body: string; footer?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b0d10">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e6e6e2">
<tr><td style="padding:22px 28px;border-bottom:1px solid #eeeeea">
<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:15px;letter-spacing:-0.02em">
<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2bd576;margin-right:8px"></span>${brand.name}</span>
</td></tr>
<tr><td style="padding:28px">${opts.body}</td></tr>
</table>
<p style="max-width:560px;font-size:12px;line-height:1.5;color:#6b6f76;margin:16px auto 0">${opts.footer ?? ""}</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:#0b0d10;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px">${esc(label)}</a>`;
}

function scoreBlock(host: string, score: number, grade: Grade): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
<td style="width:64px;height:64px;border-radius:50%;border:5px solid ${GRADE_COLOR[grade]};text-align:center;font-size:26px;font-weight:800;color:${GRADE_COLOR[grade]}">${grade}</td>
<td style="padding-left:16px"><div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#6b6f76">${esc(host)}</div>
<div style="font-size:22px;font-weight:700">${score}<span style="color:#9a9da3;font-weight:500">/100</span></div></td></tr></table>`;
}

function findingRows(findings: Finding[], max = 6): string {
  return findings
    .slice(0, max)
    .map(
      (f) => `<tr><td style="padding:8px 0;border-top:1px solid #eeeeea;font-size:14px">
<span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${SEV_COLOR[f.severity]};width:64px">${f.severity}</span>
${esc(f.title)}<div style="color:#6b6f76;font-size:13px;padding-left:68px">${esc(f.summary)}</div></td></tr>`,
    )
    .join("");
}

export function topIssues(findings: Finding[]): Finding[] {
  return findings
    .filter((f) => f.status === "fail" || f.status === "warn")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.status === "fail" ? -1 : 1));
}

export function reportEmail(p: { to: string; auditId: string; host: string; score: number; grade: Grade; findings: Finding[] }): Email {
  const link = `${appUrl()}/r/${p.auditId}`;
  const issues = topIssues(p.findings);
  return {
    to: p.to,
    subject: `${p.host} scored ${p.score}/100 (${p.grade}) — your ${brand.name} report`,
    html: layout({
      preheader: `${issues.length} issues found on ${p.host}.`,
      body: `${scoreBlock(p.host, p.score, p.grade)}
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">We found <b>${issues.length} issue(s)</b>. Key insights:</p>
${buildInsights(p.findings)
  .map(
    (i) => `<div style="border-left:3px solid ${i.tone === "bad" ? "#d23c41" : i.tone === "warn" ? "#c98a00" : "#1a9f5b"};padding:6px 12px;margin:0 0 8px">
<div style="font-size:14px;font-weight:700">${esc(i.headline)}</div><div style="font-size:13px;color:#4b4f56;line-height:1.5">${esc(i.detail)}</div></div>`,
  )
  .join("")}
<p style="margin:24px 0 0">${button(link, "Open full report")}&nbsp;&nbsp;<a href="${link.replace("/r/", "/api/audits/")}/pdf" style="font-size:14px;color:#0b0d10">Download PDF</a></p>`,
      footer: `You asked ${brand.name} to email this report.`,
    }),
    text: `${p.host}: ${p.score}/100 (${p.grade})\n\nTop issues:\n${issues
      .slice(0, 6)
      .map((f) => `- [${f.severity}] ${f.title}: ${f.summary}`)
      .join("\n")}\n\nFull report: ${link}`,
  };
}

export function confirmMonitorEmail(p: { to: string; host: string; frequency: string; confirmUrl: string }): Email {
  return {
    to: p.to,
    subject: `Confirm monitoring for ${p.host}`,
    html: layout({
      preheader: `One click to start ${p.frequency} checks on ${p.host}.`,
      body: `<h1 style="font-size:20px;margin:0 0 12px">Confirm monitoring</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 20px">${brand.name} will re-audit <b>${esc(p.host)}</b> <b>${p.frequency}</b> and email you when something breaks: site down, SSL about to expire, a new exposed file, a lost sitemap or a big score drop.</p>
<p style="margin:0 0 20px">${button(p.confirmUrl, "Confirm and start monitoring")}</p>
<p style="font-size:13px;color:#6b6f76;margin:0">If you did not ask for this, ignore this email and nothing will happen.</p>`,
    }),
    text: `Confirm ${p.frequency} monitoring of ${p.host}:\n${p.confirmUrl}\n\nIf you did not ask for this, ignore this email.`,
  };
}

export interface AlertItem {
  kind: string;
  title: string;
  detail: string;
}

export function monitorEmail(p: {
  to: string;
  host: string;
  auditId: string;
  score?: number;
  grade?: Grade;
  previousScore?: number | null;
  alerts: AlertItem[];
  findings: Finding[];
  manageUrl: string;
  unsubscribeUrl: string;
}): Email {
  const link = `${appUrl()}/r/${p.auditId}`;
  const hasAlerts = p.alerts.length > 0;
  const subject = hasAlerts
    ? `⚠ ${p.host}: ${p.alerts[0].title}${p.alerts.length > 1 ? ` (+${p.alerts.length - 1} more)` : ""}`
    : `${p.host} weekly check: ${p.score}/100, no new problems`;
  const delta =
    p.score !== undefined && p.previousScore !== undefined && p.previousScore !== null
      ? ` (${p.score - p.previousScore >= 0 ? "+" : ""}${p.score - p.previousScore} since last check)`
      : "";
  const alertHtml = p.alerts
    .map(
      (a) => `<tr><td style="padding:10px 12px;border-left:3px solid #d23c41;background:#fdf3f3;font-size:14px">
<b>${esc(a.title)}</b><div style="color:#4b4f56;font-size:13px;margin-top:2px">${esc(a.detail)}</div></td></tr><tr><td style="height:8px"></td></tr>`,
    )
    .join("");
  return {
    to: p.to,
    subject,
    unsubscribeUrl: p.unsubscribeUrl,
    html: layout({
      preheader: hasAlerts ? p.alerts.map((a) => a.title).join(" · ") : "No new problems found.",
      body: `${p.score !== undefined && p.grade ? scoreBlock(p.host, p.score, p.grade) : ""}
${hasAlerts ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${alertHtml}</table>` : `<p style="font-size:15px;margin:0 0 16px">No new problems since the last check${esc(delta)}.</p>`}
${p.findings.length ? `<p style="font-size:14px;color:#4b4f56;margin:16px 0 4px">Open issues${esc(delta)}:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${findingRows(topIssues(p.findings), 5)}</table>` : ""}
<p style="margin:24px 0 0">${button(link, "View latest report")}</p>`,
      footer: `You get this because you set up ${brand.name} monitoring for ${esc(p.host)}. <a href="${esc(p.manageUrl)}" style="color:#6b6f76">Manage</a> · <a href="${esc(p.unsubscribeUrl)}" style="color:#6b6f76">Unsubscribe</a>`,
    }),
    text: `${subject}\n\n${p.alerts.map((a) => `! ${a.title}: ${a.detail}`).join("\n")}\n\nReport: ${link}\nManage: ${p.manageUrl}\nUnsubscribe: ${p.unsubscribeUrl}`,
  };
}
