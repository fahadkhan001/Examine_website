import * as cheerio from "cheerio";
import type { AuditContext } from "@/lib/audit/context";
import type { SafeResponse } from "@/lib/audit/safe-fetch";

export function fakeResponse(p: { url?: string; status?: number; headers?: Record<string, string | string[]>; body?: string | Buffer; ttfbMs?: number }): SafeResponse {
  const body = Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body ?? "");
  const headers = Object.fromEntries(Object.entries(p.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    url: p.url ?? "https://site.test/",
    status: p.status ?? 200,
    headers,
    body,
    transferBytes: body.length,
    truncated: false,
    ttfbMs: p.ttfbMs ?? 100,
    rawHeaders: Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, String(v)] as [string, string]])),
    totalMs: 150,
    header(name) {
      const v = headers[name.toLowerCase()];
      return Array.isArray(v) ? v.join(", ") : v;
    },
    text: () => body.toString("utf8"),
  };
}

/** A context backed by fixtures; anything not provided resolves to "absent". */
export function fakeContext(p: {
  url?: string;
  html?: string;
  headers?: Record<string, string | string[]>;
  probes?: Record<string, SafeResponse>;
  overrides?: Partial<AuditContext>;
}): AuditContext {
  const url = new URL(p.url ?? "https://site.test/");
  const home = fakeResponse({ url: url.toString(), headers: p.headers, body: p.html ?? "<html></html>" });
  return {
    inputUrl: url,
    url,
    home,
    homeChain: [{ url: url.toString(), status: 200 }],
    $: cheerio.load(p.html ?? "<html></html>"),
    redirects: async () => ({ http: { start: "", chain: [] }, alternateHost: { start: `https://www.${url.host}/`, chain: [] } }),
    robots: async () => null,
    sitemap: async () => ({ valid: false, urls: [], referencedInRobots: false }),
    tls: async () => null,
    mail: async () => ({ domain: url.hostname, hasMx: false }),
    psi: async () => ({ error: "disabled in tests" }),
    speedUrl: url.toString(),
    content: async () => ({ $: cheerio.load(p.html ?? "<html></html>"), url }),
    resources: async () => [],
    crawl: async () => ({ pages: [], discovered: 0 }),
    notFound: async () => null,
    probe: async (path) => p.probes?.[path] ?? fakeResponse({ status: 404, body: "not found" }),
    ...p.overrides,
  };
}
