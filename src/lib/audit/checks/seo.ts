import { analyzeHomepage, type CrawlPage, type CrawlResult } from "../context";
import type { CheckDef } from "../types";
import { list } from "../util";

const htmlPages = (c: CrawlResult) => c.pages.filter((p) => p.isHtml && p.status !== undefined && p.status < 400 && p.finalUrl);

const path = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

/** Rate-limited or forbidden for bots: says nothing about whether the page works. */
export const isBlocked = (status?: number) => status === 429 || status === 403;

const from = (foundOn: string) => (foundOn === "sitemap" || foundOn === "start" ? foundOn : path(foundOn));

function duplicates(pages: CrawlPage[], key: (p: CrawlPage) => string | undefined): [string, CrawlPage[]][] {
  const map = new Map<string, CrawlPage[]>();
  for (const p of pages) {
    const k = key(p);
    if (k) map.set(k, [...(map.get(k) ?? []), p]);
  }
  return [...map.entries()].filter(([, ps]) => ps.length > 1);
}

export const seoChecks: CheckDef[] = [
  {
    id: "title",
    category: "seo",
    title: "Page title",
    severity: "high",
    weight: 3,
    whyItMatters: "The title is the blue headline in Google results and the browser tab label. A missing or vague title costs clicks.",
    howToFix: "Write a unique title of 30–60 characters: main keyword first, brand last.",
    fixSnippet: `<title>Handmade Leather Bags in Mumbai | Acme</title>`,
    run(ctx) {
      const titles = ctx.$("head title");
      const t = titles.first().text().trim();
      if (!t) return { status: "fail", summary: "No <title> tag." };
      if (titles.length > 1) return { status: "warn", severity: "low", summary: `${titles.length} <title> tags; keep one.`, evidence: t };
      if (t.length < 15 || t.length > 65) {
        return { status: "warn", severity: "low", summary: `Title is ${t.length} characters (aim for 30–60).`, evidence: t };
      }
      return { status: "pass", summary: `${t.length} characters.`, evidence: t };
    },
  },
  {
    id: "meta-description",
    category: "seo",
    title: "Meta description",
    severity: "medium",
    weight: 2,
    whyItMatters: "Google often shows the meta description under your title. A good one works like an ad and raises click-through rate.",
    howToFix: "Add a unique description of 70–160 characters that says what the page offers and why to click.",
    fixSnippet: `<meta name="description" content="Handmade full-grain leather bags, crafted in Mumbai. Free shipping across India and 2-year warranty.">`,
    run(ctx) {
      const d = ctx.$('meta[name="description" i]').attr("content")?.trim();
      if (!d) return { status: "fail", summary: "No meta description." };
      if (d.length < 50 || d.length > 170) {
        return { status: "warn", severity: "low", summary: `${d.length} characters (aim for 70–160).`, evidence: d };
      }
      return { status: "pass", summary: `${d.length} characters.`, evidence: d };
    },
  },
  {
    id: "h1",
    category: "seo",
    title: "One H1 heading",
    severity: "medium",
    weight: 2,
    whyItMatters: "The H1 tells search engines and screen readers what the page is about. Missing or many H1s blur that signal.",
    howToFix: "Use exactly one <h1> with the page's main topic; use <h2>–<h6> for sections.",
    run(ctx) {
      const h1s = ctx.$("h1").map((_, el) => ctx.$(el).text().trim()).get().filter(Boolean);
      if (h1s.length === 0) return { status: "fail", summary: "No <h1> on the page." };
      if (h1s.length > 1) return { status: "warn", severity: "low", summary: `${h1s.length} <h1> headings.`, evidence: list(h1s) };
      return { status: "pass", summary: "Exactly one <h1>.", evidence: h1s[0] };
    },
  },
  {
    id: "thin-homepage",
    category: "seo",
    title: "Homepage has real content",
    severity: "high",
    weight: 3,
    whyItMatters:
      "Google ranks the homepage on the HTML it receives. A splash screen, \"Enter\" gate or loader with almost no text gives Google nothing to rank, and hides your real homepage behind an extra click.",
    howToFix:
      "Serve the real homepage content at the root URL. If you want an intro animation, overlay it on top of the real page with CSS/JS instead of a separate gate page.",
    run(ctx) {
      const { words, links, gateText: gate, gateUrl } = analyzeHomepage(ctx.$, ctx.url);
      const evidence = `${words} words of visible text, ${links} link(s)${gate ? `, gate button "${gate}" → ${gateUrl ?? "?"}` : ""}`;
      if (gate || (words < 40 && links <= 3)) {
        return { status: "fail", summary: gate ? `Homepage is a splash/gate page with an "${gate}" button.` : "Homepage has almost no text content.", evidence };
      }
      if (words < 150) return { status: "warn", severity: "medium", summary: `Homepage has only ${words} words of text.`, evidence };
      return { status: "pass", summary: `${words} words of text on the homepage.` };
    },
  },
  {
    id: "analytics",
    category: "seo",
    title: "Analytics and tag manager installed",
    severity: "low",
    weight: 1,
    whyItMatters:
      "Google Tag Manager and Google Analytics show where visitors come from and what they do. A page without the tag is invisible in your reports, and a splash page without it hides every visitor who leaves before clicking through.",
    howToFix: "Add the GTM snippet to the <head> (and the noscript iframe after <body>) of every page template, including the homepage/splash page.",
    fixSnippet: `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>`,
    async run(ctx) {
      const detect = (html: string) => {
        const ids = new Set<string>();
        for (const m of html.matchAll(/\b(GTM-[A-Z0-9]{4,10}|G-[A-Z0-9]{6,12}|UA-\d{4,10}-\d{1,4}|AW-\d{6,12})\b/g)) ids.add(m[1]);
        if (/connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/.test(html)) ids.add("Meta Pixel");
        if (/static\.hotjar\.com|hotjar\.com\/c\/hotjar/.test(html)) ids.add("Hotjar");
        if (/clarity\.ms\/tag/.test(html)) ids.add("Microsoft Clarity");
        return [...ids];
      };
      const homeTags = detect(ctx.home.text());
      const content = await ctx.content();
      const contentTags = content.url.toString() === ctx.url.toString() ? homeTags : detect(content.$.html());
      const contentPath = content.url.pathname + content.url.search;
      if (!homeTags.length && !contentTags.length) return { status: "warn", summary: "No Google Tag Manager, Google Analytics or other analytics tag found." };
      if (!homeTags.length) {
        return {
          status: "warn",
          summary: `Tags found on ${contentPath} but not on the homepage, so visitors who land on the homepage and leave are not tracked.`,
          evidence: list([`homepage: none`, `${contentPath}: ${contentTags.join(", ")}`]),
        };
      }
      return { status: "pass", summary: `Found: ${[...new Set([...homeTags, ...contentTags])].join(", ")}.` };
    },
  },
  {
    id: "html-structure",
    category: "seo",
    title: "Valid HTML document structure",
    severity: "low",
    weight: 1,
    whyItMatters: "Duplicate <!DOCTYPE>, <html> or <head> tags, or content after </html>, usually means templates are included twice. Browsers guess how to repair it, and crawlers may miss tags in the wrong place.",
    howToFix: "Make sure each page outputs exactly one <!DOCTYPE html>, <html>, <head> and <body>, and that scripts sit inside <body>.",
    run(ctx) {
      const raw = ctx.home.text();
      const problems: string[] = [];
      const count = (re: RegExp) => (raw.match(re) ?? []).length;
      if (count(/<!doctype/gi) > 1) problems.push(`${count(/<!doctype/gi)} × <!DOCTYPE>`);
      if (count(/<html[\s>]/gi) > 1) problems.push(`${count(/<html[\s>]/gi)} × <html>`);
      if (count(/<head[\s>]/gi) > 1) problems.push(`${count(/<head[\s>]/gi)} × <head>`);
      if (count(/<body[\s>]/gi) > 1) problems.push(`${count(/<body[\s>]/gi)} × <body>`);
      const after = raw.split(/<\/html>/i)[1]?.trim();
      if (after) problems.push(`content after </html>: ${after.slice(0, 60).replace(/\s+/g, " ")}…`);
      if (!/^\s*<!doctype html>/i.test(raw)) problems.push("does not start with <!DOCTYPE html>");
      if (!problems.length) return { status: "pass", summary: "One doctype, html, head and body." };
      return { status: "warn", summary: `${problems.length} structure problem(s) in the homepage HTML.`, evidence: list(problems) };
    },
  },
  {
    id: "canonical",
    category: "seo",
    title: "Canonical URL",
    severity: "medium",
    weight: 2,
    whyItMatters: "A canonical tag tells Google which URL is the original when the same page is reachable at several addresses (tracking parameters, www, trailing slashes).",
    howToFix: "Add a self-referencing canonical link with the full https URL.",
    fixSnippet: `<link rel="canonical" href="https://example.com/">`,
    run(ctx) {
      const href = ctx.$('link[rel="canonical" i]').attr("href");
      if (!href) return { status: "warn", summary: "No canonical link." };
      let abs: URL;
      try {
        abs = new URL(href, ctx.url);
      } catch {
        return { status: "fail", summary: "Canonical URL is malformed.", evidence: href };
      }
      if (abs.host !== ctx.url.host) {
        return { status: "fail", summary: `Canonical points to a different host (${abs.host}).`, evidence: href };
      }
      if (abs.protocol !== ctx.url.protocol) return { status: "warn", summary: "Canonical uses a different protocol than the page.", evidence: href };
      return { status: "pass", summary: "Canonical link set.", evidence: href };
    },
  },
  {
    id: "indexable",
    category: "seo",
    title: "Page can be indexed",
    severity: "critical",
    weight: 4,
    whyItMatters: "A noindex tag or header removes the page from Google entirely. It is a common leftover from staging sites.",
    howToFix: "Remove noindex from the robots meta tag and the X-Robots-Tag header on pages that should rank.",
    run(ctx) {
      const meta = ctx.$('meta[name="robots" i], meta[name="googlebot" i]').map((_, el) => ctx.$(el).attr("content") ?? "").get().join(", ");
      const header = ctx.home.header("x-robots-tag") ?? "";
      if (/noindex/i.test(meta) || /noindex/i.test(header)) {
        return { status: "fail", summary: "Homepage is set to noindex.", evidence: list([meta && `meta robots: ${meta}`, header && `x-robots-tag: ${header}`].filter(Boolean)) };
      }
      if (ctx.home.status !== 200) return { status: "warn", summary: `Homepage returns HTTP ${ctx.home.status}.` };
      return { status: "pass", summary: "No noindex directives." };
    },
  },
  {
    id: "social-tags",
    category: "seo",
    title: "Open Graph and Twitter cards",
    severity: "low",
    weight: 1,
    whyItMatters: "These tags control the title, image and text shown when someone shares your link on WhatsApp, LinkedIn, Facebook or X.",
    howToFix: "Add og:title, og:description, og:image (1200×630) and twitter:card.",
    fixSnippet: `<meta property="og:title" content="Acme — Handmade Leather">
<meta property="og:description" content="Full-grain leather bags made in Mumbai.">
<meta property="og:image" content="https://example.com/og.jpg">
<meta property="og:url" content="https://example.com/">
<meta name="twitter:card" content="summary_large_image">`,
    run(ctx) {
      const need = ["og:title", "og:description", "og:image"];
      const missing = need.filter((p) => !ctx.$(`meta[property="${p}"]`).attr("content"));
      if (!ctx.$('meta[name="twitter:card"]').attr("content")) missing.push("twitter:card");
      if (missing.length === 0) return { status: "pass", summary: "All social sharing tags present." };
      return { status: missing.includes("og:image") || missing.length > 2 ? "fail" : "warn", summary: `Missing: ${missing.join(", ")}` };
    },
  },
  {
    id: "structured-data",
    category: "seo",
    title: "Structured data (JSON-LD)",
    severity: "low",
    weight: 1,
    whyItMatters: "Schema.org data earns rich results in Google: star ratings, prices, business hours, breadcrumbs.",
    howToFix: "Add JSON-LD for your business type (Organization, LocalBusiness, Product) and test it in Google's Rich Results Test.",
    fixSnippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Acme",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png"
}
</script>`,
    run(ctx) {
      const blocks = ctx.$('script[type="application/ld+json"]').map((_, el) => ctx.$(el).text()).get();
      if (!blocks.length) return { status: "warn", summary: "No JSON-LD found." };
      const types: string[] = [];
      let invalid = 0;
      for (const b of blocks) {
        try {
          const j = JSON.parse(b);
          const items = Array.isArray(j) ? j : j["@graph"] ?? [j];
          for (const it of items) if (it?.["@type"]) types.push(String(it["@type"]));
        } catch {
          invalid++;
        }
      }
      if (invalid) return { status: "fail", summary: `${invalid} JSON-LD block(s) are not valid JSON.` };
      return { status: "pass", summary: `Found: ${[...new Set(types)].join(", ") || "JSON-LD"}` };
    },
  },
  {
    id: "favicon",
    category: "seo",
    title: "Favicon",
    severity: "low",
    weight: 1,
    whyItMatters: "Google shows the favicon next to your result on mobile, and browsers show it in tabs and bookmarks.",
    howToFix: "Add a 48×48 (or larger) icon and an apple-touch-icon.",
    fixSnippet: `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    async run(ctx) {
      if (ctx.$('link[rel~="icon" i]').length) return { status: "pass", summary: "Icon link present." };
      const r = await ctx.probe("/favicon.ico");
      if (r && r.status === 200 && /image|icon|octet/i.test(r.header("content-type") ?? "")) {
        return { status: "pass", summary: "/favicon.ico exists (no <link> tag)." };
      }
      return { status: "fail", summary: "No favicon found." };
    },
  },
  {
    id: "robots-txt",
    category: "seo",
    title: "robots.txt",
    severity: "medium",
    weight: 2,
    whyItMatters: "robots.txt guides search engine crawlers and points them to your sitemap. A bad rule can hide your whole site from Google.",
    howToFix: "Serve a plain-text /robots.txt that allows crawling and lists your sitemap.",
    fixSnippet: `User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml`,
    async run(ctx) {
      const r = await ctx.robots();
      if (!r || r.status !== 200) return { status: "fail", summary: `/robots.txt not found (HTTP ${r?.status ?? "error"}).` };
      const text = r.text();
      if (/<html/i.test(text.slice(0, 500))) return { status: "fail", summary: "/robots.txt returns an HTML page, not a robots file." };
      // Does "User-agent: *" block everything?
      const groups = text.split(/(?=^\s*user-agent:)/im);
      const star = groups.find((g) => /^\s*user-agent:\s*\*\s*$/im.test(g));
      if (star && /^\s*disallow:\s*\/\s*$/im.test(star)) {
        return { status: "fail", severity: "critical", summary: "robots.txt blocks all crawlers (Disallow: /).", evidence: text.slice(0, 400) };
      }
      return { status: "pass", summary: "robots.txt is present and allows crawling.", evidence: text.slice(0, 400) };
    },
  },
  {
    id: "sitemap",
    category: "seo",
    title: "XML sitemap",
    severity: "medium",
    weight: 2,
    whyItMatters: "A sitemap lists every page you want indexed, so Google finds new and deep pages faster.",
    howToFix: "Generate /sitemap.xml (most CMSs and frameworks can), reference it in robots.txt and submit it in Google Search Console.",
    fixSnippet: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`,
    async run(ctx) {
      const s = await ctx.sitemap();
      if (!s.valid) return { status: "fail", summary: "No valid sitemap at /sitemap.xml or in robots.txt." };
      if (!s.referencedInRobots) {
        return { status: "warn", severity: "low", summary: `Sitemap found (${s.urls.length} URLs) but not listed in robots.txt.`, evidence: s.url };
      }
      return { status: "pass", summary: `Sitemap with ${s.urls.length} URL(s), listed in robots.txt.`, evidence: s.url };
    },
  },
  {
    id: "soft-404",
    category: "seo",
    title: "Missing pages return 404",
    severity: "medium",
    weight: 2,
    whyItMatters: "If missing pages answer \"200 OK\", Google indexes junk URLs as duplicates of your homepage (soft 404s) and wastes crawl budget.",
    howToFix: "Make the server or framework send HTTP 404 for unknown URLs, with a helpful error page.",
    async run(ctx) {
      const r = await ctx.notFound();
      if (!r) return { status: "info", summary: "Could not test a missing URL." };
      if (r.status === 404 || r.status === 410) return { status: "pass", summary: `Unknown URLs return ${r.status}.` };
      if (r.status >= 300 && r.status < 400) {
        return { status: "warn", severity: "low", summary: `Unknown URLs redirect (${r.status}) instead of returning 404.`, evidence: r.header("location") };
      }
      return { status: "fail", summary: `Unknown URLs return HTTP ${r.status}.`, evidence: r.url };
    },
  },
  {
    id: "broken-links",
    category: "seo",
    title: "No broken internal links",
    severity: "medium",
    weight: 3,
    whyItMatters: "Broken links frustrate visitors and waste search engine crawl budget on dead ends.",
    howToFix: "Fix or remove links that return 4xx/5xx, or 301-redirect the old URLs to their new location. Remove dead URLs from the sitemap.",
    async run(ctx) {
      const { pages } = await ctx.crawl();
      const tested = pages.filter((p) => p.status !== undefined || (p.error && !p.error.startsWith("skipped")));
      if (tested.length < 2) return { status: "info", summary: "No internal links to test." };
      // 429/403 means the site rate-limited or blocked our crawler, not that the page is broken.
      const blocked = tested.filter((p) => isBlocked(p.status));
      const broken = tested.filter((p) => !isBlocked(p.status) && ((p.status ?? 0) >= 400 || (p.error && !p.error.startsWith("skipped"))));
      if (!broken.length && blocked.length > tested.length / 2) {
        return { status: "info", summary: `The site blocked our crawler on ${blocked.length} of ${tested.length} pages (HTTP ${[...new Set(blocked.map((p) => p.status))].join("/")}), so links could not be tested.` };
      }
      if (broken.length) {
        return {
          status: "fail",
          severity: broken.length > 3 ? "high" : "medium",
          summary: `${broken.length} of ${tested.length} crawled routes are broken.`,
          evidence: list(broken.map((p) => `${p.status ?? "error"} ${path(p.url)}  (linked from ${from(p.foundOn)})`)),
        };
      }
      return { status: "pass", summary: `All ${tested.length} crawled routes respond.` };
    },
  },
  {
    id: "internal-redirects",
    category: "seo",
    title: "Internal links point to final URLs",
    severity: "low",
    weight: 1,
    whyItMatters: "Links and sitemap entries that go through redirects slow visitors down and waste crawl budget. Chains of several redirects can stop Google following them.",
    howToFix: "Update internal links and sitemap entries to the final URL (exact protocol, host and trailing slash).",
    async run(ctx) {
      const { pages } = await ctx.crawl();
      const redirected = pages.slice(1).filter((p) => p.redirects > 0 && p.finalUrl);
      if (pages.length < 2) return { status: "info", summary: "No internal links to test." };
      if (!redirected.length) return { status: "pass", summary: `No redirects across ${pages.length - 1} internal links.` };
      const chains = redirected.filter((p) => p.redirects > 1);
      return {
        status: chains.length ? "fail" : "warn",
        severity: chains.length ? "medium" : "low",
        summary: `${redirected.length} internal link(s) redirect${chains.length ? `; ${chains.length} through 2+ hops` : ""}.`,
        evidence: list(redirected.map((p) => `${path(p.url)} → ${p.finalUrl}${p.redirects > 1 ? ` (${p.redirects} hops)` : ""}`)),
      };
    },
  },
  {
    id: "query-gated-routes",
    category: "seo",
    title: "Pages work without URL parameters",
    severity: "high",
    weight: 3,
    whyItMatters:
      "If a page shows its real content only when the URL has a parameter like ?session=started, the clean URL shows something else. Google and anyone sharing a clean link get the wrong page, and every route competes as a duplicate.",
    howToFix:
      "Serve each page's content at its clean URL. Track sessions with a cookie, not a URL parameter, and link to clean URLs everywhere.",
    async run(ctx) {
      const pages = htmlPages(await ctx.crawl()).filter((p) => new URL(p.finalUrl!).search);
      const all = htmlPages(await ctx.crawl());
      if (all.length < 3) return { status: "info", summary: "Not enough pages crawled." };
      // A parameter that appears on most crawled routes is a site-wide gate candidate.
      const counts = new Map<string, number>();
      for (const p of pages) for (const k of new URL(p.finalUrl!).searchParams.keys()) counts.set(k, (counts.get(k) ?? 0) + 1);
      const [param, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!param || n < all.length / 2) return { status: "pass", summary: "Routes do not depend on a shared URL parameter." };

      const norm = (t: string) => t.replace(/\s+/g, " ").trim();
      const homeText = norm(ctx.home.text());
      const sample = pages.filter((p) => new URL(p.finalUrl!).searchParams.has(param)).slice(0, 4);
      const broken: string[] = [];
      for (const p of sample) {
        const u = new URL(p.finalUrl!);
        u.searchParams.delete(param);
        const clean = u.pathname + (u.search || "");
        const r = await ctx.probe(clean);
        if (!r) continue;
        const sameAsHome = norm(r.text()) === homeText;
        if (r.status >= 400 || sameAsHome || (r.status >= 300 && r.status < 400)) {
          broken.push(`${clean} → ${r.status >= 400 ? `HTTP ${r.status}` : r.status >= 300 ? `redirects to ${r.header("location")}` : "shows the homepage/splash, not this page"}`);
        }
      }
      if (broken.length) {
        return {
          status: "fail",
          summary: `${n} of ${all.length} routes need ?${param}=…; without it ${broken.length} of ${sample.length} sampled pages show the wrong content.`,
          evidence: list(broken),
        };
      }
      return { status: "warn", severity: "low", summary: `${n} of ${all.length} routes carry ?${param}=… in their links. Prefer clean URLs.` };
    },
  },
  {
    id: "page-titles",
    category: "seo",
    title: "Every page has a unique title",
    severity: "medium",
    weight: 2,
    whyItMatters: "Each page needs its own title to rank for its own topic. Missing or shared titles make pages compete with each other and look identical in Google.",
    howToFix: "Give every page a unique 30–60 character title describing that page.",
    async run(ctx) {
      const pages = htmlPages(await ctx.crawl());
      if (pages.length < 2) return { status: "info", summary: "Not enough pages crawled." };
      const missing = pages.filter((p) => !p.title).map((p) => `missing: ${path(p.finalUrl!)}`);
      const dups = duplicates(pages, (p) => p.title).map(([t, ps]) => `"${t}" on ${ps.length} pages: ${ps.map((p) => path(p.finalUrl!)).join(", ")}`);
      const bad = [...missing, ...dups];
      if (!bad.length) return { status: "pass", summary: `${pages.length} pages, all with unique titles.` };
      const worstShare = Math.max(0, ...duplicates(pages, (p) => p.title).map(([, ps]) => ps.length)) / pages.length;
      return {
        status: missing.length || worstShare > 0.5 ? "fail" : "warn",
        summary: worstShare > 0.5
          ? `${Math.round(worstShare * pages.length)} of ${pages.length} pages share the same title.`
          : `${missing.length} page(s) without a title, ${dups.length} title(s) shared by several pages.`,
        evidence: list(bad, 12),
      };
    },
  },
  {
    id: "page-descriptions",
    category: "seo",
    title: "Every page has a meta description",
    severity: "medium",
    weight: 2,
    whyItMatters: "Google uses the meta description as the text under your link. Without one it picks random page text, and shared descriptions make results look duplicated.",
    howToFix: "Write a unique 70–160 character description for every page, especially service and listing pages.",
    fixSnippet: `<meta name="description" content="Luxury 3 & 4 BHK residences in Pune with private decks. Book a site visit today.">`,
    async run(ctx) {
      const pages = htmlPages(await ctx.crawl());
      if (pages.length < 2) return { status: "info", summary: "Not enough pages crawled." };
      const missing = pages.filter((p) => !p.description);
      const badLength = pages.filter((p) => p.description && (p.description.length < 50 || p.description.length > 170));
      const dups = duplicates(pages, (p) => p.description);
      const evidence = [
        ...missing.map((p) => `missing: ${path(p.finalUrl!)}`),
        ...badLength.map((p) => `${p.description!.length} chars: ${path(p.finalUrl!)}`),
        ...dups.map(([d, ps]) => `shared by ${ps.length} pages: "${d.slice(0, 60)}…"`),
      ];
      if (!evidence.length) return { status: "pass", summary: `${pages.length} pages, all with good unique descriptions.` };
      const share = missing.length / pages.length;
      const worstShare = Math.max(0, ...dups.map(([, ps]) => ps.length)) / pages.length;
      return {
        status: share > 0.25 || worstShare > 0.5 ? "fail" : "warn",
        summary:
          worstShare > 0.5
            ? `${Math.round(worstShare * pages.length)} of ${pages.length} pages share the same description; ${missing.length} have none.`
            : `${missing.length} of ${pages.length} pages have no description; ${badLength.length} too short/long; ${dups.length} duplicated.`,
        evidence: list(evidence, 12),
      };
    },
  },
  {
    id: "page-h1",
    category: "seo",
    title: "Every page has one H1",
    severity: "low",
    weight: 1,
    whyItMatters: "Each page's H1 tells search engines and screen readers what that page is about.",
    howToFix: "Give every page exactly one <h1> with its main topic.",
    async run(ctx) {
      const pages = htmlPages(await ctx.crawl());
      if (pages.length < 2) return { status: "info", summary: "Not enough pages crawled." };
      const bad = pages.filter((p) => p.h1Count !== 1);
      if (!bad.length) return { status: "pass", summary: `All ${pages.length} pages have one H1.` };
      return {
        status: "warn",
        summary: `${bad.length} of ${pages.length} pages have ${bad.some((p) => p.h1Count === 0) ? "no H1 or " : ""}several H1s.`,
        evidence: list(bad.map((p) => `${p.h1Count} × H1: ${path(p.finalUrl!)}`), 12),
      };
    },
  },
  {
    id: "page-canonical",
    category: "seo",
    title: "Canonical tags point to the right page",
    severity: "medium",
    weight: 2,
    whyItMatters: "A canonical tag that points to another page (often a copy-pasted homepage canonical) tells Google to drop this page from search.",
    howToFix: "Make each page's canonical point to its own URL, or remove it.",
    async run(ctx) {
      const pages = htmlPages(await ctx.crawl());
      if (pages.length < 2) return { status: "info", summary: "Not enough pages crawled." };
      const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
      const wrong = pages.filter((p) => p.canonical && norm(p.canonical) !== norm(p.finalUrl!));
      if (wrong.length) {
        return {
          status: wrong.length > 1 ? "fail" : "warn",
          summary: `${wrong.length} page(s) declare a different page as canonical.`,
          evidence: list(wrong.map((p) => `${path(p.finalUrl!)} → canonical ${p.canonical}`), 12),
        };
      }
      const withTag = pages.filter((p) => p.canonical).length;
      return { status: "pass", summary: `${withTag} of ${pages.length} pages set a self-referencing canonical; none point elsewhere.` };
    },
  },
  {
    id: "noindex-pages",
    category: "seo",
    title: "No important pages hidden from Google",
    severity: "medium",
    weight: 1,
    whyItMatters: "Pages with noindex never appear in search. That is right for thank-you or admin pages, and a costly mistake on content pages.",
    howToFix: "Remove noindex from pages that should rank. Keep it only on private, thin or duplicate pages.",
    async run(ctx) {
      const pages = htmlPages(await ctx.crawl()).slice(1);
      if (!pages.length) return { status: "info", summary: "Not enough pages crawled." };
      const hidden = pages.filter((p) => p.noindex);
      if (!hidden.length) return { status: "pass", summary: `None of ${pages.length} crawled pages are noindex.` };
      return { status: "warn", summary: `${hidden.length} crawled page(s) are set to noindex. Check they are meant to be hidden.`, evidence: list(hidden.map((p) => path(p.finalUrl!))) };
    },
  },
];
