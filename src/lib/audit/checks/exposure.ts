import type { AuditContext } from "../context";
import type { SafeResponse } from "../safe-fetch";
import type { CheckDef, CheckOutcome, Severity } from "../types";
import { list } from "../util";

/**
 * Exposed-file checks. Every hit is confirmed by a content signature, never by
 * status code alone, because many sites answer 200 for any path (soft 404).
 * We only GET publicly reachable paths and never act on what we find.
 */

interface Target {
  path: string;
  /** Returns true if the body is really the sensitive file. */
  match: (r: SafeResponse) => boolean;
  label: string;
}

const isHtml = (r: SafeResponse) => /html/i.test(r.header("content-type") ?? "") || /^\s*<(!doctype|html)/i.test(r.text().slice(0, 200));
const ok = (r: SafeResponse) => r.status === 200 && r.body.length > 0;

const envLike = (r: SafeResponse) =>
  ok(r) && !isHtml(r) && /^\s*[A-Z][A-Z0-9_]*\s*=\s*\S*/m.test(r.text()) && /(KEY|SECRET|PASS|TOKEN|DB_|DATABASE|APP_)/.test(r.text());

const GROUPS: { id: string; title: string; severity: Severity; why: string; fix: string; snippet?: string; targets: Target[] }[] = [
  {
    id: "exposed-env",
    title: "Environment and config files not public",
    severity: "critical",
    why: "Files like .env and config backups usually hold database passwords, API keys and mail credentials. If they download, assume every secret inside is stolen.",
    fix: "Delete the files from the web root (or move them above it), block dotfiles in the server config, then rotate every credential that was inside.",
    snippet: `# Apache (.htaccess)
<FilesMatch "^\\.|\\.(bak|old|orig|save|swp|sql|log)$">
  Require all denied
</FilesMatch>

# Nginx
location ~ /\\.(?!well-known) { deny all; }
location ~* \\.(bak|old|orig|save|swp|sql|log)$ { deny all; }`,
    targets: [
      { path: "/.env", label: ".env", match: envLike },
      { path: "/.env.local", label: ".env.local", match: envLike },
      { path: "/.env.production", label: ".env.production", match: envLike },
      { path: "/.env.bak", label: ".env.bak", match: envLike },
      {
        path: "/wp-config.php.bak",
        label: "wp-config.php.bak",
        match: (r) => ok(r) && /DB_PASSWORD|define\(\s*['"]DB_/.test(r.text()),
      },
      {
        path: "/config.php.bak",
        label: "config.php.bak",
        match: (r) => ok(r) && /<\?php/.test(r.text()) && /(pass|secret|key)/i.test(r.text()),
      },
    ],
  },
  {
    id: "exposed-git",
    title: "Git repository not public",
    severity: "critical",
    why: "A public .git folder lets anyone download your full source code and history, including secrets that were ever committed.",
    fix: "Block /.git in the server config and stop deploying the .git folder. Rotate any secret in the repository history.",
    snippet: `# Nginx
location ~ /\\.git { deny all; }
# Apache
RedirectMatch 404 /\\.git`,
    targets: [
      { path: "/.git/HEAD", label: ".git/HEAD", match: (r) => ok(r) && /^(ref: refs\/|[0-9a-f]{40}\s*$)/.test(r.text().trim()) },
      { path: "/.git/config", label: ".git/config", match: (r) => ok(r) && /\[core\]/.test(r.text()) && !isHtml(r) },
    ],
  },
  {
    id: "exposed-backups",
    title: "No downloadable backups or database dumps",
    severity: "critical",
    why: "Backup archives and SQL dumps contain your whole site and database: customer data, password hashes and orders.",
    fix: "Remove backups and dumps from the web root. Store them outside public folders or in private storage.",
    targets: [
      ...["/backup.zip", "/site.zip", "/www.zip", "/backup.tar.gz"].map<Target>((path) => ({
        path,
        label: path.slice(1),
        match: (r) => ok(r) && (r.body.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || (r.body[0] === 0x1f && r.body[1] === 0x8b)),
      })),
      ...["/backup.sql", "/dump.sql", "/database.sql", "/db.sql"].map<Target>((path) => ({
        path,
        label: path.slice(1),
        match: (r) => ok(r) && !isHtml(r) && /(CREATE TABLE|INSERT INTO|-- MySQL dump|PostgreSQL database dump)/i.test(r.text()),
      })),
    ],
  },
  {
    id: "exposed-debug",
    title: "No debug pages or logs exposed",
    severity: "high",
    why: "phpinfo pages, server-status and error logs reveal file paths, software versions, internal IPs and sometimes credentials.",
    fix: "Delete phpinfo/info files and log files from the web root; restrict /server-status to localhost.",
    targets: [
      { path: "/phpinfo.php", label: "phpinfo.php", match: (r) => ok(r) && /phpinfo\(\)|<title>PHP \d/.test(r.text()) },
      { path: "/info.php", label: "info.php", match: (r) => ok(r) && /phpinfo\(\)|<title>PHP \d/.test(r.text()) },
      { path: "/server-status", label: "server-status", match: (r) => ok(r) && /Apache Server Status/i.test(r.text()) },
      { path: "/error_log", label: "error_log", match: (r) => ok(r) && !isHtml(r) && /PHP (Warning|Fatal|Notice|Parse)/.test(r.text()) },
      { path: "/debug.log", label: "debug.log", match: (r) => ok(r) && !isHtml(r) && /(PHP (Warning|Fatal|Notice)|\[error\])/i.test(r.text()) },
      { path: "/wp-content/debug.log", label: "wp-content/debug.log", match: (r) => ok(r) && !isHtml(r) && /PHP (Warning|Fatal|Notice)/.test(r.text()) },
    ],
  },
  {
    id: "exposed-manifests",
    title: "No project metadata files exposed",
    severity: "low",
    why: "Files like composer.json, package.json and .DS_Store reveal the exact libraries and folder names you use, which helps attackers find known vulnerabilities.",
    fix: "Keep dependency manifests and OS metadata files out of the public web root.",
    targets: [
      { path: "/composer.json", label: "composer.json", match: (r) => ok(r) && /"require"\s*:/.test(r.text()) && !isHtml(r) },
      { path: "/composer.lock", label: "composer.lock", match: (r) => ok(r) && /"packages"\s*:/.test(r.text()) && !isHtml(r) },
      { path: "/package.json", label: "package.json", match: (r) => ok(r) && /"(dependencies|scripts)"\s*:/.test(r.text()) && !isHtml(r) },
      { path: "/.DS_Store", label: ".DS_Store", match: (r) => ok(r) && r.body.subarray(4, 8).toString("latin1") === "Bud1" },
    ],
  },
];

async function scan(ctx: AuditContext, targets: Target[]): Promise<{ hits: string[]; tested: number }> {
  const results = await Promise.all(
    targets.map(async (t) => {
      const r = await ctx.probe(t.path);
      return r && t.match(r) ? `${ctx.url.origin}${t.path}` : null;
    }),
  );
  return { hits: results.filter((x): x is string => !!x), tested: targets.length };
}

export const exposureChecks: CheckDef[] = [
  ...GROUPS.map<CheckDef>((g) => ({
    id: g.id,
    category: "exposure",
    title: g.title,
    severity: g.severity,
    weight: g.severity === "critical" ? 5 : g.severity === "high" ? 3 : 1,
    whyItMatters: g.why,
    howToFix: g.fix,
    fixSnippet: g.snippet,
    async run(ctx): Promise<CheckOutcome> {
      const { hits, tested } = await scan(ctx, g.targets);
      if (hits.length) return { status: "fail", summary: `${hits.length} sensitive file(s) can be downloaded.`, evidence: list(hits) };
      return { status: "pass", summary: `Checked ${tested} common paths; none exposed.` };
    },
  })),
  {
    id: "directory-listing",
    category: "exposure",
    title: "Directory listing disabled",
    severity: "high",
    weight: 3,
    whyItMatters: "Open directory listings let anyone browse every file in a folder, including uploads, backups and private documents.",
    howToFix: "Turn off auto-indexing in the web server.",
    fixSnippet: `# Apache (.htaccess)
Options -Indexes

# Nginx
autoindex off;`,
    async run(ctx) {
      const dirs = ["/uploads/", "/images/", "/assets/", "/backup/", "/wp-content/uploads/", "/files/"];
      const hits: string[] = [];
      await Promise.all(
        dirs.map(async (d) => {
          const r = await ctx.probe(d);
          if (r && r.status === 200 && /<title>\s*Index of \//i.test(r.text())) hits.push(`${ctx.url.origin}${d}`);
        }),
      );
      if (hits.length) return { status: "fail", summary: `${hits.length} folder(s) list their contents.`, evidence: list(hits) };
      return { status: "pass", summary: `Checked ${dirs.length} common folders; no listings.` };
    },
  },
];
