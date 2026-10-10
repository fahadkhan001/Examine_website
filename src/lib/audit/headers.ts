import type { SafeResponse } from "./safe-fetch";
import type { Finding } from "./types";

/**
 * Security-header summary in the style of securityheaders.com: the six core
 * headers decide a letter grade, the cross-origin trio is shown as "upcoming".
 */
export type HeaderGrade = "A+" | "A" | "B" | "C" | "D" | "E" | "F";

export interface HeaderRow {
  name: string;
  present: boolean;
  /** Counts toward the grade (present and actually doing its job). */
  counts: boolean;
  /** Present but misconfigured (warning). */
  weak: boolean;
  value?: string;
  /** What the header does, in one line. */
  about: string;
}

export interface HeaderReport {
  grade: HeaderGrade;
  url: string;
  status: number;
  ip?: string;
  core: HeaderRow[];
  upcoming: HeaderRow[];
  /** All response headers as received; omitted for locked viewers. */
  raw?: [string, string][];
}

const CORE: { name: string; finding: string; about: string }[] = [
  { name: "Content-Security-Policy", finding: "csp", about: "Limits which scripts, styles and frames can load. Main defense against XSS." },
  { name: "Strict-Transport-Security", finding: "hsts", about: "Forces browsers to always use HTTPS for this domain." },
  { name: "X-Frame-Options", finding: "framing", about: "Stops other sites from framing yours (clickjacking)." },
  { name: "X-Content-Type-Options", finding: "nosniff", about: "Stops browsers guessing file types (MIME sniffing)." },
  { name: "Referrer-Policy", finding: "referrer-policy", about: "Controls how much of your URLs leak to other sites." },
  { name: "Permissions-Policy", finding: "permissions-policy", about: "Turns off browser features you don't use: camera, mic, location." },
];

const UPCOMING: { name: string; about: string }[] = [
  { name: "Cross-Origin-Opener-Policy", about: "Isolates your window from pages that open it, or that it opens." },
  { name: "Cross-Origin-Resource-Policy", about: "Says which sites may load your files." },
  { name: "Cross-Origin-Embedder-Policy", about: "Only allows embedded files that opt in. Needed for full cross-origin isolation." },
];

const GRADES: HeaderGrade[] = ["F", "F", "E", "D", "C", "B", "A"];

export function buildHeaderReport(home: SafeResponse, findings: Finding[]): HeaderReport {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const core: HeaderRow[] = CORE.map((h) => {
    const f = byId.get(h.finding);
    let value = home.header(h.name);
    // frame-ancestors in CSP counts as clickjacking protection, like X-Frame-Options.
    if (h.name === "X-Frame-Options" && !value && f?.status === "pass") value = "(via CSP frame-ancestors)";
    const present = !!value;
    // A CSP that restricts nothing is shown as present-but-weak and does not count.
    const ineffective = present && h.finding === "csp" && f?.status === "fail";
    return { name: h.name, about: h.about, value, present, counts: present && !ineffective, weak: present && (ineffective || f?.status === "warn") };
  });
  const upcoming: HeaderRow[] = UPCOMING.map((h) => {
    const value = home.header(h.name);
    return { name: h.name, about: h.about, value, present: !!value, counts: !!value, weak: false };
  });
  const count = core.filter((c) => c.counts).length;
  let grade = GRADES[count];
  const https = home.url.startsWith("https:");
  const warnings = core.some((c) => c.weak) || ["deprecated-headers", "duplicate-headers", "version-leak"].some((id) => byId.get(id)?.status === "warn");
  if (count === 6 && https && !warnings) grade = "A+";
  if (!https && (grade === "A" || grade === "A+")) grade = "B";
  return {
    grade,
    url: home.url,
    status: home.status,
    ip: home.remoteAddress,
    core,
    upcoming,
    raw: home.rawHeaders,
  };
}
