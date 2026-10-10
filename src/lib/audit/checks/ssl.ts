import { safeFetch } from "../safe-fetch";
import type { CheckDef } from "../types";
import { list } from "../util";

export const sslChecks: CheckDef[] = [
  {
    id: "cert-valid",
    category: "ssl",
    title: "Valid TLS certificate",
    severity: "critical",
    weight: 5,
    whyItMatters:
      "An invalid, expired or mismatched certificate shows a full-page browser warning. Most visitors leave immediately.",
    howToFix:
      "Issue a certificate that covers every hostname you serve (including www) and install the full chain. Let's Encrypt with auto-renewal is free.",
    async run(ctx) {
      const t = await ctx.tls();
      if (!t) return { status: "fail", summary: "No TLS certificate could be read on port 443." };
      const evidence = list([
        `Issuer: ${t.issuer || "unknown"}`,
        `Valid until: ${t.validTo.slice(0, 10)} (${t.daysLeft} days)`,
        `Names: ${t.subjectAltNames.replace(/DNS:/g, "").slice(0, 200)}`,
      ]);
      if (!t.authorized) return { status: "fail", summary: `Certificate is not trusted: ${t.authorizationError ?? "unknown error"}`, evidence };
      return { status: "pass", summary: "Certificate is trusted and matches the hostname.", evidence };
    },
  },
  {
    id: "cert-expiry",
    category: "ssl",
    title: "Certificate not expiring soon",
    severity: "high",
    weight: 3,
    whyItMatters: "When a certificate expires, the site becomes unreachable behind a browser warning until someone renews it.",
    howToFix: "Enable automatic renewal (certbot renew, or your host's auto-SSL) and monitor expiry.",
    async run(ctx) {
      const t = await ctx.tls();
      if (!t) return { status: "info", summary: "No certificate to check." };
      if (t.daysLeft < 0) return { status: "fail", severity: "critical", summary: `Expired ${-t.daysLeft} days ago.` };
      if (t.daysLeft < 14) return { status: "fail", summary: `Expires in ${t.daysLeft} days.` };
      if (t.daysLeft < 30) return { status: "warn", severity: "medium", summary: `Expires in ${t.daysLeft} days.` };
      return { status: "pass", summary: `Expires in ${t.daysLeft} days (${t.validTo.slice(0, 10)}).` };
    },
  },
  {
    id: "tls-version",
    category: "ssl",
    title: "Modern TLS version",
    severity: "medium",
    weight: 2,
    whyItMatters: "TLS 1.0 and 1.1 are broken and disabled in all modern browsers.",
    howToFix: "Allow only TLS 1.2 and TLS 1.3 in the server config.",
    fixSnippet: `# Nginx
ssl_protocols TLSv1.2 TLSv1.3;
# Apache
SSLProtocol -all +TLSv1.2 +TLSv1.3`,
    async run(ctx) {
      const t = await ctx.tls();
      if (!t?.protocol) return { status: "info", summary: "Could not negotiate TLS." };
      if (/TLSv1\.[23]/.test(t.protocol)) return { status: "pass", summary: `Negotiated ${t.protocol}.` };
      return { status: "fail", summary: `Negotiated outdated ${t.protocol}.` };
    },
  },
  {
    id: "canonical-host",
    category: "ssl",
    title: "www and non-www point to one address",
    severity: "medium",
    weight: 2,
    whyItMatters:
      "If both example.com and www.example.com serve the site separately, search engines split your ranking between duplicates. If one does not work at all, visitors who type it see an error.",
    howToFix: "Pick one hostname and 301-redirect the other to it. Make sure both have DNS records and a certificate.",
    fixSnippet: `# Nginx: send www to the bare domain
server {
  listen 443 ssl;
  server_name www.example.com;
  return 301 https://example.com$request_uri;
}`,
    async run(ctx) {
      const { alternateHost: alt } = await ctx.redirects();
      const altHost = new URL(alt.start).host;
      if (alt.error) {
        if (/ENOTFOUND|No DNS/i.test(alt.error)) {
          return { status: "warn", severity: "low", summary: `${altHost} has no DNS record; visitors who type it get an error.` };
        }
        return { status: "warn", summary: `${altHost} fails: ${alt.error}` };
      }
      const final = alt.finalUrl ? new URL(alt.finalUrl) : null;
      const hops = alt.chain.map((h) => `${h.status} ${h.url}${h.location ? ` → ${h.location}` : ""}`);
      if (final && final.host === ctx.url.host) {
        return { status: "pass", summary: `${altHost} redirects to ${ctx.url.host}.`, evidence: list(hops) };
      }
      // Same page on both hosts looks like "it works" in a browser, but the address bar
      // stays on the other host and Google sees two copies of the site.
      let same = false;
      try {
        const { response } = await safeFetch(alt.finalUrl ?? alt.start, { maxBytes: 512 * 1024 });
        same = response.text().replace(/\s+/g, " ") === ctx.home.text().replace(/\s+/g, " ");
      } catch {
        // keep generic message
      }
      return {
        status: "fail",
        summary: same
          ? `${altHost} shows the same page but does not redirect: the address stays on ${altHost}, so Google sees two copies of the site.`
          : `${altHost} serves content without redirecting to ${ctx.url.host}.`,
        evidence: list([...hops, `Expected: 301 ${alt.start} → https://${ctx.url.host}/`]),
      };
    },
  },
  {
    id: "redirect-chain",
    category: "ssl",
    title: "Short redirect chain",
    severity: "low",
    weight: 1,
    whyItMatters: "Every redirect hop adds a network round trip before the page starts loading, which hurts speed on mobile.",
    howToFix: "Redirect straight to the final https:// URL in one hop.",
    async run(ctx) {
      const { http } = await ctx.redirects();
      const hops = Math.max(ctx.homeChain.length, http.chain.length) - 1;
      const evidence = list(http.chain.map((h) => `${h.status} ${h.url}${h.location ? ` → ${h.location}` : ""}`));
      if (hops > 2) return { status: "warn", summary: `${hops} redirects before the page loads.`, evidence };
      return { status: "pass", summary: hops ? `${hops} redirect(s); fine.` : "No redirects.", evidence };
    },
  },
  {
    id: "spf",
    category: "ssl",
    title: "SPF record (email spoofing)",
    severity: "medium",
    weight: 2,
    whyItMatters: "Without SPF, anyone can send email that claims to come from your domain. It is used for phishing your customers.",
    howToFix: "Publish an SPF TXT record listing the services that send mail for you. If the domain sends no mail, publish \"v=spf1 -all\".",
    fixSnippet: `example.com.  TXT  "v=spf1 include:_spf.google.com ~all"
# Domain that never sends mail:
example.com.  TXT  "v=spf1 -all"`,
    async run(ctx) {
      const m = await ctx.mail();
      if (m.spf) {
        if (/\+all\b/.test(m.spf)) return { status: "fail", summary: "SPF uses +all, which allows any server.", evidence: m.spf };
        return { status: "pass", summary: `SPF record found for ${m.domain}.`, evidence: m.spf };
      }
      return { status: m.hasMx ? "fail" : "warn", severity: m.hasMx ? "medium" : "low", summary: `No SPF record on ${m.domain}.` };
    },
  },
  {
    id: "dmarc",
    category: "ssl",
    title: "DMARC record",
    severity: "medium",
    weight: 2,
    whyItMatters: "DMARC tells Gmail and Outlook to reject mail that fakes your domain, and sends you reports when someone tries.",
    howToFix: "Publish a DMARC record. Start with p=none to collect reports, then move to quarantine or reject.",
    fixSnippet: `_dmarc.example.com.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"`,
    async run(ctx) {
      const m = await ctx.mail();
      if (!m.dmarc) return { status: m.hasMx ? "fail" : "warn", severity: m.hasMx ? "medium" : "low", summary: `No DMARC record on _dmarc.${m.domain}.` };
      if (/p=none/i.test(m.dmarc)) return { status: "warn", severity: "low", summary: "DMARC is in monitor-only mode (p=none).", evidence: m.dmarc };
      return { status: "pass", summary: "DMARC is enforced.", evidence: m.dmarc };
    },
  },
];
