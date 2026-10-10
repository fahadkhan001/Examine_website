import type { AuditContext } from "../context";
import type { PsiRun } from "../psi";
import type { CheckDef, CheckOutcome } from "../types";
import { formatBytes, list } from "../util";

async function mobileOrDesktop(ctx: AuditContext): Promise<{ run?: PsiRun; label: string; error?: string }> {
  const psi = await ctx.psi();
  if (psi.mobile) return { run: psi.mobile, label: "mobile" };
  if (psi.desktop) return { run: psi.desktop, label: "desktop" };
  return { label: "", error: psi.error };
}

/** " for /path" when speed was measured on a page other than the homepage. */
function measuredOn(ctx: AuditContext): string {
  if (ctx.speedUrl === ctx.url.toString()) return "";
  const u = new URL(ctx.speedUrl);
  return ` for ${u.pathname}${u.search} (page behind the splash screen)`;
}

function scoreOutcome(score: number | undefined, label: string): CheckOutcome {
  if (score === undefined) return { status: "info", summary: `No ${label} score returned.` };
  if (score >= 90) return { status: "pass", summary: `${score}/100 on ${label}.` };
  if (score >= 50) return { status: "warn", severity: "medium", summary: `${score}/100 on ${label}.` };
  return { status: "fail", summary: `${score}/100 on ${label}.` };
}

export const performanceChecks: CheckDef[] = [
  {
    id: "psi-mobile",
    category: "performance",
    title: "Mobile performance score",
    severity: "high",
    weight: 4,
    whyItMatters: "Most visitors arrive on phones. Google ranks on mobile speed, and every extra second of load time loses visitors and sales.",
    howToFix: "Compress and resize images, defer non-critical JavaScript, remove unused CSS/JS and use a CDN. The findings below point at the biggest wins.",
    async run(ctx) {
      const psi = await ctx.psi();
      if (!psi.mobile) return { status: "info", summary: psi.error ?? "Lighthouse did not return a mobile result." };
      return scoreOutcome(psi.mobile.performance, `${psi.source === "local" ? "mobile (local Lighthouse)" : "mobile (Lighthouse)"}${measuredOn(ctx)}`);
    },
  },
  {
    id: "psi-desktop",
    category: "performance",
    title: "Desktop performance score",
    severity: "medium",
    weight: 2,
    whyItMatters: "Slow desktop pages hurt conversions for visitors on laptops, which is often where purchases and enquiries happen.",
    howToFix: "Same fixes as mobile: optimize images, defer scripts, cache static files.",
    async run(ctx) {
      const psi = await ctx.psi();
      if (!psi.desktop) {
        return { status: "info", summary: psi.source === "local" ? "Desktop run skipped (local Lighthouse runs mobile only)." : psi.error ?? "Lighthouse did not return a desktop result." };
      }
      return scoreOutcome(psi.desktop.performance, `desktop (Lighthouse)${measuredOn(ctx)}`);
    },
  },
  {
    id: "lcp",
    category: "performance",
    title: "Largest Contentful Paint (LCP)",
    severity: "high",
    weight: 3,
    whyItMatters: "LCP is when the main content appears. Google's target is under 2.5 seconds; it is a Core Web Vitals ranking signal.",
    howToFix: "Serve the hero image in WebP/AVIF at the right size, preload it, avoid lazy-loading it, and reduce server response time.",
    fixSnippet: `<link rel="preload" as="image" href="/hero.avif" fetchpriority="high">
<img src="/hero.avif" width="1200" height="600" fetchpriority="high" alt="…">`,
    async run(ctx) {
      const { run, label, error } = await mobileOrDesktop(ctx);
      if (!run) return { status: "info", summary: error ?? "No data." };
      const field = run.field?.lcpMs;
      const ms = field ?? run.audits["largest-contentful-paint"]?.numericValue;
      if (ms === undefined) return { status: "info", summary: "No LCP data." };
      const src = field !== undefined ? "real users (CrUX)" : `lab, ${label}`;
      const s = `${(ms / 1000).toFixed(1)} s (${src})`;
      if (ms <= 2500) return { status: "pass", summary: s };
      if (ms <= 4000) return { status: "warn", severity: "medium", summary: s };
      return { status: "fail", summary: s };
    },
  },
  {
    id: "cls",
    category: "performance",
    title: "Cumulative Layout Shift (CLS)",
    severity: "medium",
    weight: 2,
    whyItMatters: "Layout shift is content jumping while the page loads, causing mis-taps. Google's target is under 0.1.",
    howToFix: "Set width and height on images and embeds, reserve space for ads and banners, and avoid inserting content above existing content.",
    async run(ctx) {
      const { run, label, error } = await mobileOrDesktop(ctx);
      if (!run) return { status: "info", summary: error ?? "No data." };
      const field = run.field?.cls;
      const v = field ?? run.audits["cumulative-layout-shift"]?.numericValue;
      if (v === undefined) return { status: "info", summary: "No CLS data." };
      const s = `${v.toFixed(2)} (${field !== undefined ? "real users (CrUX)" : `lab, ${label}`})`;
      if (v <= 0.1) return { status: "pass", summary: s };
      if (v <= 0.25) return { status: "warn", summary: s };
      return { status: "fail", severity: "high", summary: s };
    },
  },
  {
    id: "interactivity",
    category: "performance",
    title: "Responsiveness (INP / TBT)",
    severity: "medium",
    weight: 2,
    whyItMatters: "Measures how fast the page reacts to taps and clicks. Heavy JavaScript makes buttons feel frozen.",
    howToFix: "Remove unused JavaScript, split large bundles, defer third-party scripts (chat widgets, trackers) until after load.",
    async run(ctx) {
      const { run, label, error } = await mobileOrDesktop(ctx);
      if (!run) return { status: "info", summary: error ?? "No data." };
      if (run.field?.inpMs !== undefined) {
        const v = run.field.inpMs;
        const s = `INP ${v} ms (real users)`;
        if (v <= 200) return { status: "pass", summary: s };
        if (v <= 500) return { status: "warn", summary: s };
        return { status: "fail", severity: "high", summary: s };
      }
      const tbt = run.audits["total-blocking-time"]?.numericValue;
      if (tbt === undefined) return { status: "info", summary: "No data." };
      const s = `Total Blocking Time ${Math.round(tbt)} ms (lab, ${label})`;
      if (tbt <= 200) return { status: "pass", summary: s };
      if (tbt <= 600) return { status: "warn", summary: s };
      return { status: "fail", summary: s };
    },
  },
  {
    id: "ttfb",
    category: "performance",
    title: "Server response time",
    severity: "medium",
    weight: 2,
    whyItMatters: "Time to first byte is how long the server thinks before sending anything. Nothing can render until it arrives.",
    howToFix: "Enable page caching (or a CDN cache), upgrade slow hosting, and optimize slow database queries.",
    run(ctx) {
      const ms = Math.round(ctx.home.ttfbMs);
      const s = `${ms} ms from our server to first byte.`;
      if (ms <= 800) return { status: "pass", summary: s };
      if (ms <= 1800) return { status: "warn", summary: s };
      return { status: "fail", summary: s };
    },
  },
  {
    id: "slow-pages",
    category: "performance",
    title: "All pages respond quickly",
    severity: "medium",
    weight: 2,
    whyItMatters: "A fast homepage is not enough. Slow inner pages (listings, product, contact) lose visitors who arrive on them from search.",
    howToFix: "Add page caching for inner pages, and check slow database queries or external API calls on the slowest routes.",
    async run(ctx) {
      const pages = (await ctx.crawl()).pages.filter((p) => p.ttfbMs !== undefined && (p.status ?? 500) < 400);
      if (pages.length < 2) return { status: "info", summary: "Not enough pages crawled." };
      const slow = pages.filter((p) => p.ttfbMs! > 1500).sort((a, b) => b.ttfbMs! - a.ttfbMs!);
      const avg = Math.round(pages.reduce((n, p) => n + p.ttfbMs!, 0) / pages.length);
      if (!slow.length) return { status: "pass", summary: `${pages.length} pages, average response ${avg} ms.` };
      return {
        status: slow.length > pages.length / 3 ? "fail" : "warn",
        summary: `${slow.length} of ${pages.length} pages take over 1.5 s to respond (average ${avg} ms).`,
        evidence: list(slow.map((p) => `${p.ttfbMs} ms  ${new URL(p.finalUrl ?? p.url).pathname}`)),
      };
    },
  },
  {
    id: "page-weight",
    category: "performance",
    title: "Page weight",
    severity: "medium",
    weight: 2,
    whyItMatters: "Heavy pages load slowly on mobile data and cost visitors money. Aim for under 2 MB.",
    howToFix: "Compress images (WebP/AVIF, correct dimensions), remove unused libraries and fonts, lazy-load below-the-fold media.",
    async run(ctx) {
      const psi = await ctx.psi();
      const run = psi.mobile ?? psi.desktop;
      let bytes = run?.audits["total-byte-weight"]?.numericValue;
      let src = "Lighthouse";
      if (bytes === undefined) {
        const res = await ctx.resources();
        bytes = ctx.home.transferBytes + res.reduce((n, r) => n + (r.bytes ?? 0), 0);
        src = "estimate from HTML + linked files";
      }
      const s = `${formatBytes(bytes)} (${src})${src === "Lighthouse" ? measuredOn(ctx) : ""}.`;
      if (bytes <= 2_000_000) return { status: "pass", summary: s };
      if (bytes <= 4_000_000) return { status: "warn", summary: s };
      return { status: "fail", severity: "high", summary: s };
    },
  },
  {
    id: "request-count",
    category: "performance",
    title: "Number of requests",
    severity: "low",
    weight: 1,
    whyItMatters: "Each file is a separate request. Pages with 100+ requests are slow on mobile networks.",
    howToFix: "Bundle scripts and styles, remove unused third-party tags, and use SVG sprites or icon fonts sparingly.",
    async run(ctx) {
      const psi = await ctx.psi();
      const run = psi.mobile ?? psi.desktop;
      const n = run?.audits["network-requests"]?.itemCount;
      if (n === undefined) return { status: "info", summary: "Request count needs Lighthouse data." };
      if (n <= 80) return { status: "pass", summary: `${n} requests.` };
      if (n <= 150) return { status: "warn", summary: `${n} requests.` };
      return { status: "fail", summary: `${n} requests.` };
    },
  },
  {
    id: "compression",
    category: "performance",
    title: "Text compression (Brotli/Gzip)",
    severity: "medium",
    weight: 2,
    whyItMatters: "Compression shrinks HTML, CSS and JavaScript by 70–80%. Without it, pages are several times bigger than needed.",
    howToFix: "Enable Brotli or Gzip on the server or CDN for text/html, text/css, application/javascript, application/json and image/svg+xml.",
    fixSnippet: `# Nginx
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
# Apache
AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json`,
    async run(ctx) {
      const enc = ctx.home.header("content-encoding");
      const res = await ctx.resources();
      const text = res.filter((r) => (r.kind === "script" || r.kind === "style") && r.status === 200 && (r.bytes ?? 0) > 1500);
      const uncompressed = text.filter((r) => !r.encoding).map((r) => r.url);
      if (!enc) {
        return { status: "fail", summary: "HTML is sent uncompressed.", evidence: list(uncompressed) || undefined };
      }
      if (uncompressed.length) {
        return { status: "warn", summary: `HTML uses ${enc}; ${uncompressed.length} script/style file(s) are uncompressed.`, evidence: list(uncompressed) };
      }
      return { status: "pass", summary: `HTML uses ${enc}.` };
    },
  },
  {
    id: "caching",
    category: "performance",
    title: "Browser caching of static files",
    severity: "low",
    weight: 2,
    whyItMatters: "Long cache lifetimes mean returning visitors do not re-download your images, CSS and JavaScript.",
    howToFix: "Serve versioned static files with Cache-Control: public, max-age=31536000, immutable.",
    fixSnippet: `# Nginx
location ~* \\.(css|js|png|jpg|jpeg|webp|avif|svg|woff2)$ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}`,
    async run(ctx) {
      const site = ctx.url.hostname.split(".").slice(-2).join(".");
      const res = (await ctx.resources()).filter((r) => {
        const host = new URL(r.url).hostname;
        return r.status === 200 && (host === site || host.endsWith(`.${site}`) || /assets|static|cdn/.test(host.split(".")[0]));
      });
      if (!res.length) return { status: "info", summary: "No same-site static files found to test." };
      const short = res.filter((r) => {
        const age = Number(/max-age=(\d+)/i.exec(r.cacheControl ?? "")?.[1] ?? 0);
        return age < 7 * 86_400 || /no-store|no-cache/i.test(r.cacheControl ?? "");
      });
      const ratio = 1 - short.length / res.length;
      const summary = `${res.length - short.length} of ${res.length} static files cached for 7+ days.`;
      const evidence = list(short.map((r) => `${r.cacheControl ?? "no cache-control"}  ${r.url}`));
      if (ratio >= 0.8) return { status: "pass", summary };
      if (ratio >= 0.4) return { status: "warn", summary, evidence };
      return { status: "fail", summary, evidence };
    },
  },
  {
    id: "image-formats",
    category: "performance",
    title: "Modern image formats",
    severity: "low",
    weight: 2,
    whyItMatters: "WebP and AVIF images are 25–50% smaller than JPEG/PNG at the same quality.",
    howToFix: "Convert photos to WebP or AVIF (Squoosh, Sharp, or your CDN's auto-format) and serve them with <picture> fallbacks.",
    fixSnippet: `<picture>
  <source srcset="/photo.avif" type="image/avif">
  <source srcset="/photo.webp" type="image/webp">
  <img src="/photo.jpg" width="800" height="600" alt="…" loading="lazy">
</picture>`,
    async run(ctx) {
      const imgs = (await ctx.resources()).filter((r) => r.kind === "image" && r.status === 200);
      if (!imgs.length) return { status: "info", summary: "No images found in the HTML." };
      const legacy = imgs.filter((r) => /image\/(jpe?g|png|gif|bmp)/i.test(r.contentType ?? "") || (!r.contentType && /\.(jpe?g|png|gif|bmp)(\?|$)/i.test(r.url)));
      const big = legacy.filter((r) => (r.bytes ?? 0) > 100_000);
      const summary = `${legacy.length} of ${imgs.length} images use JPEG/PNG/GIF${big.length ? `; ${big.length} are over 100 KB` : ""}.`;
      const evidence = list(legacy.map((r) => `${r.bytes ? formatBytes(r.bytes) : "?"}  ${r.url}`));
      if (big.length >= 3) return { status: "fail", summary, evidence };
      if (legacy.length > imgs.length / 2 && legacy.length >= 3) return { status: "warn", summary, evidence };
      return { status: "pass", summary };
    },
  },
  {
    id: "render-blocking",
    category: "performance",
    title: "Render-blocking scripts",
    severity: "medium",
    weight: 2,
    whyItMatters: "Scripts in <head> without async or defer stop the browser from showing anything until they download and run.",
    howToFix: "Add defer (or async for independent scripts like analytics), or move scripts to the end of <body>.",
    fixSnippet: `<script src="/app.js" defer></script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXXX" async></script>`,
    async run(ctx) {
      const { $ } = await ctx.content();
      const blocking = $("head script[src]")
        .filter((_, el) => {
          const e = $(el);
          return e.attr("async") === undefined && e.attr("defer") === undefined && e.attr("type") !== "module";
        })
        .map((_, el) => $(el).attr("src"))
        .get();
      const css = $('head link[rel~="stylesheet"]').length;
      if (blocking.length > 2) return { status: "fail", summary: `${blocking.length} blocking scripts in <head>.`, evidence: list(blocking) };
      if (blocking.length > 0 || css > 4) {
        return {
          status: "warn",
          summary: `${blocking.length} blocking script(s) and ${css} stylesheet(s) in <head>.`,
          evidence: list(blocking) || undefined,
        };
      }
      return { status: "pass", summary: "No render-blocking scripts in <head>." };
    },
  },
];
