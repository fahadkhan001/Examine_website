import type { CheckDef } from "../types";
import { list } from "../util";

const isHttps = (u: URL) => u.protocol === "https:";

export const securityChecks: CheckDef[] = [
  {
    id: "https",
    category: "security",
    title: "Site is served over HTTPS",
    severity: "critical",
    weight: 5,
    whyItMatters:
      "Without HTTPS, anyone on the network can read or change what visitors see and send, including passwords and form data. Browsers mark the site as \"Not secure\" and Google ranks it lower.",
    howToFix:
      "Install a free TLS certificate (Let's Encrypt, or your host's one-click SSL) and serve every page over https://.",
    run(ctx) {
      if (isHttps(ctx.url)) return { status: "pass", summary: `Final URL uses HTTPS: ${ctx.url.origin}` };
      return { status: "fail", summary: `Site ends up on plain HTTP: ${ctx.url.origin}` };
    },
  },
  {
    id: "http-redirect",
    category: "security",
    title: "HTTP redirects to HTTPS",
    severity: "high",
    weight: 3,
    whyItMatters:
      "Visitors who type the domain or follow old links land on http://. Without a redirect they stay on an insecure connection.",
    howToFix: "Add a permanent (301) redirect from every http:// URL to its https:// version.",
    fixSnippet: `# Apache (.htaccess)
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Nginx
server {
  listen 80;
  server_name example.com www.example.com;
  return 301 https://$host$request_uri;
}`,
    async run(ctx) {
      const { http } = await ctx.redirects();
      if (http.error) return { status: "info", summary: `Could not test http:// (${http.error})` };
      const final = http.finalUrl ? new URL(http.finalUrl) : null;
      const hops = http.chain.map((h) => `${h.status} ${h.url}${h.location ? ` → ${h.location}` : ""}`);
      if (final && isHttps(final)) {
        const first = http.chain[0];
        if (first && first.status !== 301 && first.status !== 308) {
          return {
            status: "warn",
            severity: "low",
            summary: `Redirects to HTTPS, but with a temporary ${first.status} instead of a permanent 301.`,
            evidence: list(hops),
          };
        }
        return { status: "pass", summary: "http:// permanently redirects to https://", evidence: list(hops) };
      }
      return { status: "fail", summary: "http:// does not redirect to https://", evidence: list(hops) };
    },
  },
  {
    id: "hsts",
    category: "security",
    title: "Strict-Transport-Security (HSTS)",
    severity: "medium",
    weight: 3,
    whyItMatters:
      "HSTS tells browsers to always use HTTPS for your domain, which blocks downgrade and cookie-hijacking attacks on public Wi-Fi.",
    howToFix: "Send the Strict-Transport-Security header on HTTPS responses with a max-age of at least 6 months.",
    fixSnippet: `# Apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

# Nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
    run(ctx) {
      if (!isHttps(ctx.url)) return { status: "fail", summary: "Not applicable until the site uses HTTPS." };
      const v = ctx.home.header("strict-transport-security");
      if (!v) return { status: "fail", summary: "Header is missing." };
      const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(v)?.[1] ?? 0);
      if (maxAge < 15_552_000) {
        return {
          status: "warn",
          severity: "low",
          summary: `max-age is ${maxAge}s (under 180 days).`,
          evidence: `strict-transport-security: ${v}`,
        };
      }
      return { status: "pass", summary: "HSTS is enabled.", evidence: `strict-transport-security: ${v}` };
    },
  },
  {
    id: "csp",
    category: "security",
    title: "Content-Security-Policy",
    severity: "medium",
    weight: 3,
    whyItMatters:
      "A CSP limits which scripts can run on your pages. It is the strongest defense against cross-site scripting (XSS) and injected card skimmers.",
    howToFix:
      "Start with a report-only policy, review the reports, then enforce it. Avoid 'unsafe-inline' for scripts; use nonces or hashes.",
    fixSnippet: `Content-Security-Policy: default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`,
    run(ctx) {
      const v = ctx.home.header("content-security-policy");
      const ro = ctx.home.header("content-security-policy-report-only");
      if (!v && ro) {
        return { status: "warn", summary: "Only a report-only policy is set; nothing is enforced.", evidence: ro };
      }
      if (!v) return { status: "fail", summary: "Header is missing." };
      if (!/(^|;)\s*(default-src|script-src)\b/i.test(v)) {
        return {
          status: "fail",
          summary: "A policy is set but has no default-src or script-src, so it does not restrict scripts.",
          evidence: v,
        };
      }
      const scriptSrc = /script-src([^;]*)/i.exec(v)?.[1] ?? /default-src([^;]*)/i.exec(v)?.[1] ?? "";
      if (/'unsafe-inline'/.test(scriptSrc) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc)) {
        return {
          status: "warn",
          severity: "low",
          summary: "Policy allows 'unsafe-inline' scripts, which weakens XSS protection.",
          evidence: v,
        };
      }
      return { status: "pass", summary: "A Content-Security-Policy is enforced.", evidence: v };
    },
  },
  {
    id: "framing",
    category: "security",
    title: "Clickjacking protection",
    severity: "medium",
    weight: 2,
    whyItMatters:
      "Without it, another site can load yours in an invisible frame and trick visitors into clicking buttons (clickjacking).",
    howToFix: "Send X-Frame-Options: SAMEORIGIN, or a CSP with frame-ancestors 'self'.",
    fixSnippet: `X-Frame-Options: SAMEORIGIN
# or, in your CSP:
Content-Security-Policy: frame-ancestors 'self'`,
    run(ctx) {
      const xfo = ctx.home.header("x-frame-options");
      const fa = /frame-ancestors[^;]*/i.exec(ctx.home.header("content-security-policy") ?? "")?.[0];
      if (fa) return { status: "pass", summary: "CSP frame-ancestors is set.", evidence: fa };
      if (xfo) {
        const values = xfo.split(",").map((v) => v.trim().toUpperCase());
        if (new Set(values).size > 1) {
          return { status: "warn", summary: `X-Frame-Options is sent more than once with conflicting values; browsers ignore it.`, evidence: `x-frame-options: ${xfo}` };
        }
        if (values[0] === "DENY" || values[0] === "SAMEORIGIN") return { status: "pass", summary: "X-Frame-Options is set.", evidence: `x-frame-options: ${xfo}` };
        return {
          status: "warn",
          summary: `X-Frame-Options has an invalid value${/ALLOW-FROM/i.test(xfo) ? " (ALLOW-FROM is obsolete and ignored)" : ""}; use DENY or SAMEORIGIN.`,
          evidence: `x-frame-options: ${xfo}`,
        };
      }
      return { status: "fail", summary: "Neither X-Frame-Options nor frame-ancestors is set." };
    },
  },
  {
    id: "nosniff",
    category: "security",
    title: "X-Content-Type-Options",
    severity: "low",
    weight: 1,
    whyItMatters: "Stops browsers from guessing file types, which attackers use to run uploaded files as scripts.",
    howToFix: "Send X-Content-Type-Options: nosniff on every response.",
    fixSnippet: `X-Content-Type-Options: nosniff`,
    run(ctx) {
      const v = ctx.home.header("x-content-type-options");
      if (!v) return { status: "fail", summary: "Header is missing." };
      if (v.trim().toLowerCase() !== "nosniff") return { status: "warn", summary: `Invalid value "${v}"; the only valid value is nosniff.` };
      return { status: "pass", summary: "nosniff is set." };
    },
  },
  {
    id: "referrer-policy",
    category: "security",
    title: "Referrer-Policy",
    severity: "low",
    weight: 1,
    whyItMatters:
      "Controls how much of your page URLs leak to other sites. Full URLs can contain search terms, tokens or order IDs.",
    howToFix: "Send Referrer-Policy: strict-origin-when-cross-origin.",
    fixSnippet: `Referrer-Policy: strict-origin-when-cross-origin`,
    run(ctx) {
      const v = ctx.home.header("referrer-policy") ?? ctx.$('meta[name="referrer"]').attr("content");
      if (!v) return { status: "warn", summary: "No policy set; browser default applies." };
      // A comma list means "use the last value the browser understands".
      const effective = v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).at(-1) ?? "";
      if (effective === "unsafe-url" || effective === "no-referrer-when-downgrade") {
        return { status: "warn", summary: `Policy "${effective}" leaks full URLs to other sites.` };
      }
      if (effective === "origin") {
        return { status: "warn", severity: "low", summary: `Policy "origin" sends your domain even from HTTPS to HTTP sites; strict-origin-when-cross-origin is recommended.` };
      }
      return { status: "pass", summary: `Policy: ${v}` };
    },
  },
  {
    id: "permissions-policy",
    category: "security",
    title: "Permissions-Policy",
    severity: "low",
    weight: 1,
    whyItMatters:
      "Lets you switch off powerful browser features (camera, microphone, location) so a compromised third-party script cannot use them.",
    howToFix: "Send a Permissions-Policy header that disables features you do not use.",
    fixSnippet: `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`,
    run(ctx) {
      return ctx.home.header("permissions-policy")
        ? { status: "pass", summary: "Permissions-Policy is set." }
        : { status: "warn", summary: "Header is missing." };
    },
  },
  {
    id: "cross-origin",
    category: "security",
    title: "Cross-origin isolation headers",
    severity: "low",
    weight: 1,
    whyItMatters:
      "Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy and Cross-Origin-Embedder-Policy stop other sites from opening, embedding or reading your pages and files. They block cross-site leaks and Spectre-style attacks. Security scanners list them as the next headers to adopt.",
    howToFix:
      "Start with Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Resource-Policy: same-site. Add Cross-Origin-Embedder-Policy only after checking that third-party embeds (maps, videos, fonts) still load.",
    fixSnippet: `Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
# Only when every embedded resource supports it:
Cross-Origin-Embedder-Policy: require-corp`,
    run(ctx) {
      const names = ["cross-origin-opener-policy", "cross-origin-resource-policy", "cross-origin-embedder-policy"];
      const present = names.filter((n) => ctx.home.header(n));
      const missing = names.filter((n) => !ctx.home.header(n));
      const evidence = list([...present.map((n) => `${n}: ${ctx.home.header(n)}`), ...missing.map((n) => `${n}: missing`)]);
      if (!missing.length) return { status: "pass", summary: "COOP, CORP and COEP are all set.", evidence };
      if (ctx.home.header("cross-origin-opener-policy")) return { status: "pass", summary: `COOP is set; ${missing.length} optional header(s) missing.`, evidence };
      return { status: "warn", summary: `${missing.length} of 3 cross-origin headers missing.`, evidence };
    },
  },
  {
    id: "deprecated-headers",
    category: "security",
    title: "No deprecated security headers",
    severity: "low",
    weight: 1,
    whyItMatters:
      "Old headers like X-XSS-Protection, Expect-CT, Public-Key-Pins and Feature-Policy do nothing in modern browsers. X-XSS-Protection: 1 even created new XSS holes in old browsers. They give a false sense of protection.",
    howToFix: "Remove them. Use Content-Security-Policy instead of X-XSS-Protection (or send X-XSS-Protection: 0), and Permissions-Policy instead of Feature-Policy.",
    fixSnippet: `# Apache
Header unset Expect-CT
Header unset Public-Key-Pins
Header always set X-XSS-Protection "0"`,
    run(ctx) {
      const found: string[] = [];
      const xss = ctx.home.header("x-xss-protection");
      if (xss && xss.trim() !== "0") found.push(`x-xss-protection: ${xss} (set to 0 or remove; rely on CSP)`);
      for (const h of ["expect-ct", "public-key-pins", "public-key-pins-report-only", "feature-policy"]) {
        const v = ctx.home.header(h);
        if (v) found.push(`${h}: ${v.slice(0, 80)}`);
      }
      if (!found.length) return { status: "pass", summary: "No deprecated security headers." };
      return { status: "warn", summary: `${found.length} deprecated header(s) still sent.`, evidence: list(found) };
    },
  },
  {
    id: "duplicate-headers",
    category: "security",
    title: "Security headers sent once",
    severity: "low",
    weight: 1,
    whyItMatters:
      "When a security header is sent twice (often by both the app and the server or CDN), browsers may ignore it or combine the values unpredictably, silently switching the protection off.",
    howToFix: "Set each security header in one place only: either the application, the web server, or the CDN.",
    run(ctx) {
      const single = ["strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy"];
      const counts = new Map<string, number>();
      for (const [k] of ctx.home.rawHeaders) {
        const n = k.toLowerCase();
        if (single.includes(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      const csp = ctx.home.rawHeaders.filter(([k]) => k.toLowerCase() === "content-security-policy").length;
      const dups = [...counts].filter(([, c]) => c > 1).map(([n, c]) => `${n} × ${c}`);
      if (csp > 1) dups.push(`content-security-policy × ${csp} (all policies apply; the strictest wins, which can break the site)`);
      if (!dups.length) return { status: "pass", summary: "Each security header is sent once." };
      return { status: "warn", summary: `${dups.length} security header(s) sent more than once.`, evidence: list(dups) };
    },
  },
  {
    id: "version-leak",
    category: "security",
    title: "Server software versions hidden",
    severity: "low",
    weight: 2,
    whyItMatters:
      "Headers like \"Server: Apache/2.4.41\" or \"X-Powered-By: PHP/7.4\" tell attackers exactly which known vulnerabilities to try.",
    howToFix: "Hide version numbers in server headers and remove the generator meta tag.",
    fixSnippet: `# Apache (httpd.conf)
ServerTokens Prod
ServerSignature Off
# php.ini
expose_php = Off
# Nginx
server_tokens off;`,
    run(ctx) {
      const leaks: string[] = [];
      const server = ctx.home.header("server");
      if (server && /\d/.test(server)) leaks.push(`server: ${server}`);
      for (const h of ["x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"]) {
        const v = ctx.home.header(h);
        if (v) leaks.push(`${h}: ${v}`);
      }
      const gen = ctx.$('meta[name="generator"]').attr("content");
      if (gen && /\d/.test(gen)) leaks.push(`<meta name="generator" content="${gen}">`);
      if (leaks.length) return { status: "warn", summary: `${leaks.length} version disclosure(s) found.`, evidence: list(leaks) };
      return { status: "pass", summary: "No software versions exposed." };
    },
  },
  {
    id: "cookies",
    category: "security",
    title: "Cookie security flags",
    severity: "medium",
    weight: 2,
    whyItMatters:
      "Cookies without Secure can be sent over plain HTTP; without HttpOnly, any injected script can steal them; without SameSite, they ride along on cross-site requests (CSRF).",
    howToFix: "Set Secure, HttpOnly and SameSite=Lax (or Strict) on every cookie, especially session cookies.",
    fixSnippet: `// PHP
session_set_cookie_params(['secure' => true, 'httponly' => true, 'samesite' => 'Lax']);

// Express
res.cookie('sid', value, { secure: true, httpOnly: true, sameSite: 'lax' });`,
    run(ctx) {
      const raw = ctx.home.headers["set-cookie"] ?? [];
      if (raw.length === 0) return { status: "pass", summary: "Homepage sets no cookies." };
      const problems: string[] = [];
      for (const c of raw) {
        const name = c.split("=")[0].trim();
        const missing: string[] = [];
        if (isHttps(ctx.url) && !/;\s*secure/i.test(c)) missing.push("Secure");
        if (!/;\s*httponly/i.test(c)) missing.push("HttpOnly");
        if (!/;\s*samesite=/i.test(c)) missing.push("SameSite");
        if (missing.length) problems.push(`${name}: missing ${missing.join(", ")}`);
      }
      if (!problems.length) return { status: "pass", summary: `${raw.length} cookie(s), all flagged correctly.` };
      const session = problems.some((p) => /sess|sid|auth|token|login/i.test(p));
      return {
        status: session ? "fail" : "warn",
        summary: `${problems.length} of ${raw.length} cookie(s) are missing security flags.`,
        evidence: list(problems),
      };
    },
  },
  {
    id: "mixed-content",
    category: "security",
    title: "No mixed content",
    severity: "high",
    weight: 3,
    whyItMatters:
      "An HTTPS page that loads scripts or styles over http:// can be hijacked; browsers block them, which breaks the page. Insecure images trigger warnings.",
    howToFix: "Change every http:// asset URL to https:// (or a protocol-relative path) and re-test.",
    fixSnippet: `Content-Security-Policy: upgrade-insecure-requests`,
    async run(ctx) {
      if (!isHttps(ctx.url)) return { status: "info", summary: "Not applicable: page is not served over HTTPS." };
      const { $ } = await ctx.content();
      const active: string[] = [];
      const passive: string[] = [];
      $("script[src], iframe[src]").each((_, el) => {
        const v = $(el).attr("src")!;
        if (/^http:\/\//i.test(v)) active.push(v);
      });
      $('link[rel~="stylesheet"][href]').each((_, el) => {
        const v = $(el).attr("href")!;
        if (/^http:\/\//i.test(v)) active.push(v);
      });
      $("form[action]").each((_, el) => {
        const v = $(el).attr("action")!;
        if (/^http:\/\//i.test(v)) active.push(`form → ${v}`);
      });
      $("img[src], video[src], audio[src], source[src]").each((_, el) => {
        const v = $(el).attr("src")!;
        if (/^http:\/\//i.test(v)) passive.push(v);
      });
      if (active.length) {
        return { status: "fail", summary: `${active.length} script/style/frame/form URL(s) use http://`, evidence: list([...active, ...passive]) };
      }
      if (passive.length) {
        return { status: "warn", severity: "medium", summary: `${passive.length} media URL(s) use http://`, evidence: list(passive) };
      }
      return { status: "pass", summary: "All page resources use HTTPS." };
    },
  },
];
