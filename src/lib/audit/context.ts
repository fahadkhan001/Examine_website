import dns from "node:dns/promises";
import tls from "node:tls";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { limits } from "@/lib/config";
import { guardedLookup, safeFetch, safeRequest, type RedirectHop, type SafeResponse } from "./safe-fetch";
import { fetchPsi, type PsiData } from "./psi";
import { mapLimit, memo } from "./util";

/**
 * Shared inputs for all checks. The homepage is fetched eagerly; everything
 * else is fetched lazily and memoized, so checks running in parallel never
 * duplicate a request.
 */
export interface AuditContext {
  inputUrl: URL;
  /** Final homepage URL after redirects. */
  url: URL;
  home: SafeResponse;
  homeChain: RedirectHop[];
  $: CheerioAPI;
  redirects(): Promise<RedirectProbes>;
  robots(): Promise<SafeResponse | null>;
  sitemap(): Promise<SitemapInfo>;
  tls(): Promise<TlsInfo | null>;
  mail(): Promise<MailDns>;
  psi(): Promise<PsiData>;
  /** Page that speed tests measure: the homepage, or the real page behind a splash gate. */
  speedUrl: string;
  /** Parsed HTML of the main content page (the homepage, or the page behind a splash gate). */
  content(): Promise<{ $: CheerioAPI; url: URL }>;
  resources(): Promise<ResourceInfo[]>;
  crawl(): Promise<CrawlResult>;
  notFound(): Promise<SafeResponse | null>;
  /** GET a path on the site origin without following redirects (64 KB cap). */
  probe(path: string): Promise<SafeResponse | null>;
}

export interface Probe {
  start: string;
  finalUrl?: string;
  chain: RedirectHop[];
  error?: string;
}

export interface RedirectProbes {
  http: Probe;
  alternateHost: Probe;
}

export interface SitemapInfo {
  url?: string;
  status?: number;
  valid: boolean;
  urls: string[];
  referencedInRobots: boolean;
}

export interface TlsInfo {
  authorized: boolean;
  authorizationError?: string;
  protocol: string | null;
  validFrom: string;
  validTo: string;
  daysLeft: number;
  issuer: string;
  subjectAltNames: string;
}

export interface MailDns {
  domain: string;
  hasMx: boolean;
  spf?: string;
  dmarc?: string;
}

export interface ResourceInfo {
  url: string;
  kind: "script" | "style" | "image" | "font" | "other";
  status?: number;
  bytes?: number;
  contentType?: string;
  cacheControl?: string;
  encoding?: string;
  error?: string;
}

export interface CrawlPage {
  /** URL as linked. */
  url: string;
  /** URL after redirects. */
  finalUrl?: string;
  status?: number;
  /** Redirect hops before the final response. */
  redirects: number;
  isHtml?: boolean;
  title?: string;
  description?: string;
  h1Count?: number;
  canonical?: string;
  noindex?: boolean;
  ttfbMs?: number;
  bytes?: number;
  error?: string;
  /** Where the link was found ("sitemap", a page URL, or "start"). */
  foundOn: string;
}

export interface CrawlResult {
  /** Homepage first, then crawled routes. */
  pages: CrawlPage[];
  /** Unique internal URLs found (crawled or not). */
  discovered: number;
}

/** Visible words, link count and a splash "Enter"-style gate link, if any. */
export function analyzeHomepage($: CheerioAPI, base: URL): { words: number; links: number; gateText?: string; gateUrl?: string } {
  const body = $("body").clone();
  body.find("script, style, noscript, svg").remove();
  const words = body.text().split(/\s+/).filter((w) => w.length > 1).length;
  const anchors = $("a[href]");
  let gateText: string | undefined;
  let gateUrl: string | undefined;
  anchors.each((_, el) => {
    const text = $(el).text().trim();
    if (!gateText && /^(enter|enter site|enter website|skip|skip intro|continue|start)$/i.test(text)) {
      gateText = text;
      try {
        const u = new URL($(el).attr("href")!, base);
        if (u.origin === base.origin) gateUrl = u.toString();
      } catch {
        // ignore
      }
    }
  });
  return { words, links: anchors.length, gateText, gateUrl };
}

export class UnreachableSiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreachableSiteError";
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function probeChain(start: string): Promise<Probe> {
  try {
    const { response, chain } = await safeFetch(start, { method: "HEAD", timeoutMs: 6000 });
    return { start, finalUrl: response.url, chain };
  } catch (e) {
    return { start, chain: [], error: errMsg(e) };
  }
}

export function registrableGuess(hostname: string): string {
  return hostname.replace(/^www\./i, "");
}

export async function createContext(inputUrl: URL): Promise<AuditContext> {
  let fetched: Awaited<ReturnType<typeof safeFetch>>;
  try {
    fetched = await safeFetch(inputUrl);
  } catch (e) {
    // https failed (bad cert, no 443)? Try plain http before giving up.
    if (inputUrl.protocol === "https:") {
      const httpUrl = new URL(inputUrl);
      httpUrl.protocol = "http:";
      try {
        fetched = await safeFetch(httpUrl);
      } catch {
        throw new UnreachableSiteError(`We could not reach ${inputUrl.host}: ${errMsg(e)}`);
      }
    } else {
      throw new UnreachableSiteError(`We could not reach ${inputUrl.host}: ${errMsg(e)}`);
    }
  }
  const home = fetched.response;
  const ctxInputUrl = inputUrl.toString();
  if (home.status >= 500 || home.status === 0) {
    throw new UnreachableSiteError(`${inputUrl.host} answered with HTTP ${home.status}`);
  }
  const url = new URL(home.url);
  const $ = cheerio.load(home.text());
  const origin = url.origin;

  const robots = memo(async () => {
    try {
      const r = await safeRequest(`${origin}/robots.txt`, { maxBytes: 256 * 1024 });
      return r;
    } catch {
      return null;
    }
  });

  const sitemap = memo(async (): Promise<SitemapInfo> => {
    const r = await robots();
    const fromRobots =
      r && r.status === 200
        ? [...r.text().matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1])
        : [];
    const candidates = [...fromRobots, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
    for (const candidate of [...new Set(candidates)].slice(0, 4)) {
      try {
        const { response } = await safeFetch(candidate, { maxBytes: 2 * 1024 * 1024 });
        const body = response.text();
        const valid = response.status === 200 && /<(urlset|sitemapindex)[\s>]/i.test(body);
        if (valid) {
          const urls = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
          return {
            url: candidate,
            status: response.status,
            valid,
            urls,
            referencedInRobots: fromRobots.includes(candidate),
          };
        }
      } catch {
        // try next candidate
      }
    }
    return { valid: false, urls: [], referencedInRobots: fromRobots.length > 0 };
  });

  const redirects = memo(async (): Promise<RedirectProbes> => {
    const httpStart = `http://${url.host}/`;
    const altHost = url.hostname.startsWith("www.")
      ? url.hostname.slice(4)
      : `www.${url.hostname}`;
    const [httpProbe, alt] = await Promise.all([
      probeChain(httpStart),
      probeChain(`${url.protocol}//${altHost}/`),
    ]);
    return { http: httpProbe, alternateHost: alt };
  });

  const tlsInfo = memo(
    () =>
      new Promise<TlsInfo | null>((resolve) => {
        const socket = tls.connect({
          host: url.hostname,
          servername: url.hostname,
          port: 443,
          rejectUnauthorized: false,
          lookup: guardedLookup,
          timeout: 6000,
        });
        const done = (v: TlsInfo | null) => {
          socket.destroy();
          resolve(v);
        };
        socket.once("secureConnect", () => {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) return done(null);
          const validTo = new Date(cert.valid_to);
          done({
            authorized: socket.authorized,
            authorizationError: socket.authorizationError
              ? String(socket.authorizationError)
              : undefined,
            protocol: socket.getProtocol(),
            validFrom: cert.valid_from,
            validTo: validTo.toISOString(),
            daysLeft: Math.floor((validTo.getTime() - Date.now()) / 86_400_000),
            issuer: [cert.issuer?.O, cert.issuer?.CN].filter(Boolean).join(" / "),
            subjectAltNames: cert.subjectaltname ?? "",
          });
        });
        socket.once("timeout", () => done(null));
        socket.once("error", () => done(null));
      }),
  );

  const mail = memo(async (): Promise<MailDns> => {
    const domain = registrableGuess(url.hostname);
    const txt = async (name: string) => {
      try {
        return (await dns.resolveTxt(name)).map((parts) => parts.join(""));
      } catch {
        return [];
      }
    };
    const [mx, rootTxt, dmarcTxt] = await Promise.all([
      dns.resolveMx(domain).catch(() => []),
      txt(domain),
      txt(`_dmarc.${domain}`),
    ]);
    return {
      domain,
      hasMx: mx.length > 0,
      spf: rootTxt.find((t) => /^v=spf1/i.test(t)),
      dmarc: dmarcTxt.find((t) => /^v=DMARC1/i.test(t)),
    };
  });

  const homeInfo = analyzeHomepage($, url);
  const speedUrl = homeInfo.gateUrl ?? url.toString();
  const psi = memo(() => fetchPsi(speedUrl));

  const content = memo(async () => {
    if (speedUrl === url.toString()) return { $, url };
    try {
      const { response } = await safeFetch(speedUrl, { maxBytes: 2 * 1024 * 1024 });
      if (response.status < 400 && /html/i.test(response.header("content-type") ?? "")) {
        return { $: cheerio.load(response.text()), url: new URL(response.url) };
      }
    } catch {
      // fall back to the homepage
    }
    return { $, url };
  });

  const resources = memo(async (): Promise<ResourceInfo[]> => {
    const { $, url } = await content();
    const seen = new Set<string>();
    const list: { url: string; kind: ResourceInfo["kind"] }[] = [];
    const add = (raw: string | undefined, kind: ResourceInfo["kind"]) => {
      if (!raw || raw.startsWith("data:")) return;
      try {
        const abs = new URL(raw, url).toString();
        if (seen.has(abs) || !/^https?:/.test(abs)) return;
        seen.add(abs);
        list.push({ url: abs, kind });
      } catch {
        // ignore malformed URLs
      }
    };
    $("script[src]").each((_, el) => add($(el).attr("src"), "script"));
    $('link[rel~="stylesheet"]').each((_, el) => add($(el).attr("href"), "style"));
    $("img").each((_, el) => add($(el).attr("src") ?? $(el).attr("data-src"), "image"));
    $('link[rel="preload"][as="font"]').each((_, el) => add($(el).attr("href"), "font"));

    return mapLimit(list.slice(0, 40), 8, async (item): Promise<ResourceInfo> => {
      try {
        const { response } = await safeFetch(item.url, { method: "HEAD", timeoutMs: 5000 });
        const len = Number(response.header("content-length"));
        return {
          ...item,
          status: response.status,
          bytes: Number.isFinite(len) && len > 0 ? len : undefined,
          contentType: response.header("content-type"),
          cacheControl: response.header("cache-control"),
          encoding: response.header("content-encoding"),
        };
      } catch (e) {
        return { ...item, error: errMsg(e) };
      }
    });
  });

  /** Pulls page-level SEO facts out of an HTML document. */
  const pageFacts = (doc: CheerioAPI, base: URL) => {
    const canonicalHref = doc('link[rel="canonical" i]').attr("href");
    let canonical: string | undefined;
    try {
      canonical = canonicalHref ? new URL(canonicalHref, base).toString() : undefined;
    } catch {
      canonical = canonicalHref;
    }
    const robotsMeta = doc('meta[name="robots" i]').map((_, el) => doc(el).attr("content") ?? "").get().join(",");
    return {
      title: doc("title").first().text().trim() || undefined,
      description: doc('meta[name="description" i]').attr("content")?.trim() || undefined,
      h1Count: doc("h1").length,
      canonical,
      noindex: /noindex/i.test(robotsMeta),
    };
  };

  const internalLinks = (doc: CheerioAPI, base: URL): string[] => {
    const out: string[] = [];
    doc("a[href]").each((_, el) => {
      const href = doc(el).attr("href");
      if (!href || /^(mailto:|tel:|javascript:|#|whatsapp:|sms:)/i.test(href)) return;
      try {
        const abs = new URL(href, base);
        abs.hash = "";
        if (abs.origin !== origin) return;
        if (/\.(jpe?g|png|gif|webp|avif|svg|pdf|zip|mp4|webm|mp3|docx?|xlsx?)$/i.test(abs.pathname)) return;
        out.push(abs.toString());
      } catch {
        // ignore malformed hrefs
      }
    });
    return out;
  };

  /**
   * Breadth-first crawl of same-origin pages, seeded from homepage links and the
   * sitemap. Records status, redirects and on-page SEO facts for every route.
   */
  const crawl = memo(async (): Promise<CrawlResult> => {
    const deadline = Date.now() + limits.crawlBudgetMs;
    const homeEntry: CrawlPage = {
      url: ctxInputUrl,
      finalUrl: url.toString(),
      status: home.status,
      redirects: fetched.chain.length - 1,
      isHtml: true,
      ttfbMs: Math.round(home.ttfbMs),
      bytes: home.transferBytes,
      foundOn: "start",
      ...pageFacts($, url),
    };
    const seen = new Set<string>([url.toString(), ctxInputUrl]);
    const queue: [string, string][] = [];
    const enqueue = (u: string, from: string) => {
      if (seen.has(u)) return;
      seen.add(u);
      queue.push([u, from]);
    };
    for (const l of internalLinks($, url)) enqueue(l, url.toString());
    const sm = await sitemap();
    for (const loc of sm.urls.slice(0, 200)) {
      try {
        if (new URL(loc).origin === origin) enqueue(loc, "sitemap");
      } catch {
        // ignore bad sitemap entries
      }
    }

    const pages: CrawlPage[] = [homeEntry];
    const fetchPage = async ([pageUrl, foundOn]: [string, string]): Promise<CrawlPage> => {
      if (Date.now() > deadline) return { url: pageUrl, foundOn, redirects: 0, error: "skipped (time budget)" };
      try {
        const { response, chain } = await safeFetch(pageUrl, { maxBytes: 768 * 1024, timeoutMs: 7000 });
        const finalUrl = new URL(response.url);
        const isHtml = /html/i.test(response.header("content-type") ?? "");
        const page: CrawlPage = {
          url: pageUrl,
          finalUrl: response.url,
          status: response.status,
          redirects: chain.length - 1,
          isHtml,
          ttfbMs: Math.round(response.ttfbMs),
          bytes: response.transferBytes,
          foundOn,
        };
        if (isHtml && response.status < 400) {
          const doc = cheerio.load(response.text());
          Object.assign(page, pageFacts(doc, finalUrl));
          if (finalUrl.origin === origin) for (const l of internalLinks(doc, finalUrl)) enqueue(l, response.url);
        }
        return page;
      } catch (e) {
        return { url: pageUrl, foundOn, redirects: 0, error: errMsg(e) };
      }
    };

    // Process the queue in waves so links found on crawled pages get visited too.
    while (queue.length && pages.length < limits.crawlMaxPages + 1 && Date.now() < deadline) {
      const wave = queue.splice(0, Math.min(5, limits.crawlMaxPages + 1 - pages.length));
      pages.push(...(await Promise.all(wave.map(fetchPage))));
    }
    return { pages, discovered: seen.size };
  });

  const notFound = memo(async () => {
    try {
      const rand = Math.random().toString(36).slice(2, 10);
      return await safeRequest(`${origin}/examweb-missing-${rand}`, { maxBytes: 64 * 1024 });
    } catch {
      return null;
    }
  });

  const probes = new Map<string, Promise<SafeResponse | null>>();
  const probe = (path: string) => {
    let p = probes.get(path);
    if (!p) {
      p = safeRequest(`${origin}${path}`, { maxBytes: 64 * 1024, timeoutMs: 6000 }).catch(() => null);
      probes.set(path, p);
    }
    return p;
  };

  return {
    inputUrl,
    url,
    home,
    homeChain: fetched.chain,
    $,
    redirects,
    robots,
    sitemap,
    tls: tlsInfo,
    mail,
    psi,
    speedUrl,
    content,
    resources,
    crawl,
    notFound,
    probe,
  };
}
