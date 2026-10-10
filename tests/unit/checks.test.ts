import { describe, expect, it } from "vitest";
import { CHECK_BY_ID } from "@/lib/audit/checks";
import { fakeContext, fakeResponse } from "./fake-context";

const run = (id: string, ctx: Parameters<NonNullable<ReturnType<typeof CHECK_BY_ID.get>>["run"]>[0]) =>
  Promise.resolve(CHECK_BY_ID.get(id)!.run(ctx));

const GOOD_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": "default-src 'self'; frame-ancestors 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()",
};

describe("security checks", () => {
  it("passes a well-configured site", async () => {
    const ctx = fakeContext({ headers: GOOD_HEADERS });
    for (const id of ["https", "hsts", "csp", "framing", "nosniff", "referrer-policy", "permissions-policy", "version-leak", "cookies"]) {
      expect((await run(id, ctx)).status, id).toBe("pass");
    }
  });

  it("flags missing headers", async () => {
    const ctx = fakeContext({});
    expect((await run("hsts", ctx)).status).toBe("fail");
    expect((await run("csp", ctx)).status).toBe("fail");
    expect((await run("framing", ctx)).status).toBe("fail");
  });

  it("warns on short HSTS and unsafe-inline CSP", async () => {
    const ctx = fakeContext({ headers: { "strict-transport-security": "max-age=300", "content-security-policy": "script-src 'self' 'unsafe-inline'" } });
    expect((await run("hsts", ctx)).status).toBe("warn");
    expect((await run("csp", ctx)).status).toBe("warn");
  });

  it("detects version leaks", async () => {
    const ctx = fakeContext({ headers: { server: "Apache/2.4.41 (Ubuntu)", "x-powered-by": "PHP/7.4.3" } });
    const r = await run("version-leak", ctx);
    expect(r.status).toBe("warn");
    expect(r.evidence).toContain("Apache/2.4.41");
  });

  it("fails session cookies without flags", async () => {
    const ctx = fakeContext({ headers: { "set-cookie": ["PHPSESSID=abc; path=/"] } });
    expect((await run("cookies", ctx)).status).toBe("fail");
  });

  it("detects active mixed content", async () => {
    const ctx = fakeContext({ html: '<html><head><script src="http://cdn.test/a.js"></script></head></html>' });
    expect((await run("mixed-content", ctx)).status).toBe("fail");
  });
});

describe("exposure checks", () => {
  it("confirms a real .env by content", async () => {
    const ctx = fakeContext({ probes: { "/.env": fakeResponse({ headers: { "content-type": "text/plain" }, body: "APP_KEY=base64:abc\nDB_PASSWORD=hunter2\n" }) } });
    const r = await run("exposed-env", ctx);
    expect(r.status).toBe("fail");
    expect(r.evidence).toContain("/.env");
  });

  it("ignores soft-404 HTML pages that answer 200 for every path", async () => {
    const soft = fakeResponse({ headers: { "content-type": "text/html" }, body: "<!doctype html><html><title>Home</title>DB_PASSWORD in a blog post</html>" });
    const probes = Object.fromEntries(["/.env", "/.git/HEAD", "/.git/config", "/backup.sql", "/composer.json", "/phpinfo.php"].map((p) => [p, soft]));
    const ctx = fakeContext({ probes });
    for (const id of ["exposed-env", "exposed-git", "exposed-backups", "exposed-manifests", "exposed-debug"]) {
      expect((await run(id, ctx)).status, id).toBe("pass");
    }
  });

  it("detects an exposed git HEAD and directory listing", async () => {
    const ctx = fakeContext({
      probes: {
        "/.git/HEAD": fakeResponse({ body: "ref: refs/heads/main\n" }),
        "/uploads/": fakeResponse({ body: "<html><head><title>Index of /uploads</title></head></html>" }),
      },
    });
    expect((await run("exposed-git", ctx)).status).toBe("fail");
    expect((await run("directory-listing", ctx)).status).toBe("fail");
  });

  it("detects zip backups by magic bytes", async () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    const ctx = fakeContext({ probes: { "/backup.zip": fakeResponse({ body: zip }) } });
    expect((await run("exposed-backups", ctx)).status).toBe("fail");
  });
});

describe("seo checks", () => {
  const html = `<html lang="en"><head><title>Handmade leather bags made in Mumbai</title>
    <meta name="description" content="Full-grain leather bags handmade in Mumbai. Free shipping across India, two year warranty.">
    <link rel="canonical" href="https://site.test/"><link rel="icon" href="/i.svg">
    <meta property="og:title" content="x"><meta property="og:description" content="x"><meta property="og:image" content="x"><meta name="twitter:card" content="summary">
    <script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Bags</h1></body></html>`;

  it("passes a well-tagged page", async () => {
    const ctx = fakeContext({ html });
    for (const id of ["title", "meta-description", "h1", "canonical", "indexable", "social-tags", "structured-data", "favicon"]) {
      expect((await run(id, ctx)).status, id).toBe("pass");
    }
  });

  it("fails noindex and robots that block everything", async () => {
    const ctx = fakeContext({
      html: '<html><head><meta name="robots" content="noindex"></head></html>',
      overrides: { robots: async () => fakeResponse({ body: "User-agent: *\nDisallow: /\n" }) },
    });
    expect((await run("indexable", ctx)).status).toBe("fail");
    const r = await run("robots-txt", ctx);
    expect(r.status).toBe("fail");
    expect(r.severity).toBe("critical");
  });

  it("flags soft 404s", async () => {
    const ctx = fakeContext({ overrides: { notFound: async () => fakeResponse({ status: 200 }) } });
    expect((await run("soft-404", ctx)).status).toBe("fail");
  });

  it("reports broken internal links", async () => {
    const ctx = fakeContext({
      overrides: {
        crawl: async () => ({
          discovered: 3,
          pages: [
            { url: "https://site.test/", finalUrl: "https://site.test/", status: 200, redirects: 0, foundOn: "start" },
            { url: "https://site.test/a", status: 404, redirects: 0, foundOn: "https://site.test/" },
            { url: "https://site.test/b", status: 200, redirects: 0, foundOn: "https://site.test/" },
          ],
        }),
      },
    });
    const r = await run("broken-links", ctx);
    expect(r.status).toBe("fail");
    expect(r.evidence).toContain("404 /a");
  });
});

describe("accessibility checks", () => {
  it("finds images without alt and unlabeled inputs", async () => {
    const ctx = fakeContext({ html: '<html><body><img src="a.jpg"><img src="b.jpg"><input name="q" placeholder="Search"><a href="/x"><svg></svg></a></body></html>' });
    expect((await run("img-alt", ctx)).status).toBe("fail");
    expect((await run("form-labels", ctx)).status).toBe("fail");
    expect((await run("link-names", ctx)).status).toBe("warn");
    expect((await run("html-lang", ctx)).status).toBe("fail");
    expect((await run("viewport", ctx)).status).toBe("fail");
  });

  it("accepts labeled fields", async () => {
    const ctx = fakeContext({ html: '<label for="e">Email</label><input id="e"><label>Name <input name="n"></label><input aria-label="Search">' });
    expect((await run("form-labels", ctx)).status).toBe("pass");
  });
});

describe("ssl checks", () => {
  it("grades certificate expiry", async () => {
    const tls = (daysLeft: number) => async () => ({ authorized: true, protocol: "TLSv1.3", validFrom: "", validTo: new Date().toISOString(), daysLeft, issuer: "R3", subjectAltNames: "" });
    expect((await run("cert-expiry", fakeContext({ overrides: { tls: tls(90) } }))).status).toBe("pass");
    expect((await run("cert-expiry", fakeContext({ overrides: { tls: tls(20) } }))).status).toBe("warn");
    expect((await run("cert-expiry", fakeContext({ overrides: { tls: tls(5) } }))).status).toBe("fail");
    expect((await run("cert-expiry", fakeContext({ overrides: { tls: tls(-1) } }))).severity).toBe("critical");
  });
});

describe("homepage content checks", () => {
  it("flags splash/gate homepages and broken document structure", async () => {
    const html = `<!DOCTYPE html><html lang="en"><!DOCTYPE html><html lang="en"><head><title>X</title></head><body><div><img src="a.gif" alt=""><a class="button" href="index.php?session=started">Enter</a></div></body></html><script>1</script>`;
    const ctx = fakeContext({ html });
    expect((await run("thin-homepage", ctx)).status).toBe("fail");
    const r = await run("html-structure", ctx);
    expect(r.status).toBe("warn");
    expect(r.evidence).toContain("2 × <!DOCTYPE>");
    expect(r.evidence).toContain("content after </html>");
  });

  it("passes a normal content homepage", async () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const ctx = fakeContext({ html: `<!DOCTYPE html><html><head></head><body><p>${words}</p><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a><a href="/d">D</a></body></html>` });
    expect((await run("thin-homepage", ctx)).status).toBe("pass");
    expect((await run("html-structure", ctx)).status).toBe("pass");
  });
});

describe("per-route checks", () => {
  const page = (path: string, extra: Record<string, unknown> = {}) => ({
    url: `https://site.test${path}`,
    finalUrl: `https://site.test${path}`,
    status: 200,
    redirects: 0,
    isHtml: true,
    title: `Title for ${path} page here`,
    description: `A long enough description for the ${path} page that sits inside the limits.`,
    h1Count: 1,
    foundOn: "https://site.test/",
    ...extra,
  });
  const crawlCtx = (pages: ReturnType<typeof page>[]) => fakeContext({ overrides: { crawl: async () => ({ pages, discovered: pages.length }) } });

  it("passes clean routes", async () => {
    const ctx = crawlCtx([page("/"), page("/about"), page("/contact")]);
    for (const id of ["page-titles", "page-descriptions", "page-h1", "page-canonical", "internal-redirects", "noindex-pages"]) {
      expect((await run(id, ctx)).status, id).toBe("pass");
    }
  });

  it("flags missing/duplicate meta, wrong canonicals and redirecting links", async () => {
    const ctx = crawlCtx([
      page("/"),
      page("/a", { description: undefined, title: "Same" }),
      page("/b", { description: undefined, title: "Same", h1Count: 0, canonical: "https://site.test/" }),
      page("/old", { finalUrl: "https://site.test/new", redirects: 2 }),
    ]);
    expect((await run("page-descriptions", ctx)).status).toBe("fail");
    expect((await run("page-titles", ctx)).status).toBe("warn");
    expect((await run("page-h1", ctx)).status).toBe("warn");
    expect((await run("page-canonical", ctx)).status).toBe("warn");
    const r = await run("internal-redirects", ctx);
    expect(r.status).toBe("fail");
    expect(r.evidence).toContain("/old → https://site.test/new (2 hops)");
  });
});

describe("query-gated routes", () => {
  it("fails when clean URLs show the splash instead of the page", async () => {
    const splash = "<html><body><a href='/index.php?session=started'>Enter</a></body></html>";
    const mk = (path: string) => ({ url: `https://site.test${path}`, finalUrl: `https://site.test${path}`, status: 200, redirects: 0, isHtml: true, foundOn: "x" });
    const ctx = fakeContext({
      html: splash,
      probes: { "/eden.php": fakeResponse({ body: splash }), "/about.php": fakeResponse({ body: splash }) },
      overrides: { crawl: async () => ({ discovered: 3, pages: [mk("/"), mk("/eden.php?session=started"), mk("/about.php?session=started")] }) },
    });
    const r = await run("query-gated-routes", ctx);
    expect(r.status).toBe("fail");
    expect(r.evidence).toContain("/eden.php → shows the homepage/splash");
  });
});

describe("analytics", () => {
  it("detects GTM/GA4 ids and warns when the homepage lacks them", async () => {
    const tagged = `<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-24S5N70BBV"></script><script>(function(){})('GTM-5L455SW3')</script></head><body></body></html>`;
    expect((await run("analytics", fakeContext({ html: tagged }))).summary).toContain("GTM-5L455SW3");
    const ctx = fakeContext({ html: "<html><body>splash</body></html>", overrides: { content: async () => ({ $: (await import("cheerio")).load(tagged), url: new URL("https://site.test/index.php?session=started") }) } });
    const r = await run("analytics", ctx);
    expect(r.status).toBe("warn");
    expect(r.evidence).toContain("G-24S5N70BBV");
  });
});
