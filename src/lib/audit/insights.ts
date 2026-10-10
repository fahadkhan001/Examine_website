import type { Finding, PageRow } from "./types";

/**
 * Key insights: the few plain-language takeaways a site owner should read
 * first. Deterministic rules over the findings, ordered by business impact.
 */
export interface Insight {
  tone: "bad" | "warn" | "good";
  headline: string;
  detail: string;
  /** Findings that back this insight (for "show me" links). */
  findingIds: string[];
}

const failed = (f?: Finding) => f?.status === "fail";
const flagged = (f?: Finding) => f?.status === "fail" || f?.status === "warn";
const passed = (f?: Finding) => f?.status === "pass";

export function buildInsights(findings: Finding[], pages: PageRow[] = [], max = 5): Insight[] {
  const by = new Map(findings.map((f) => [f.id, f]));
  const get = (id: string) => by.get(id);
  const issues: Insight[] = [];
  const goods: Insight[] = [];

  // 1. Secrets on the open internet beat everything else.
  const exposed = findings.filter((f) => f.category === "exposure" && failed(f));
  if (exposed.length) {
    issues.push({
      tone: "bad",
      headline: "Private files can be downloaded by anyone",
      detail: `${exposed.map((f) => f.title.replace(/ not public| disabled| exposed/gi, "")).join(", ")}. Treat any password or key in them as stolen and change it today.`,
      findingIds: exposed.map((f) => f.id),
    });
  }

  if (failed(get("https")) || failed(get("cert-valid"))) {
    issues.push({ tone: "bad", headline: "Browsers warn visitors this site is not secure", detail: (get("cert-valid")?.summary ?? get("https")?.summary)!, findingIds: ["https", "cert-valid"] });
  } else if (flagged(get("cert-expiry"))) {
    issues.push({ tone: "bad", headline: "SSL certificate is about to expire", detail: `${get("cert-expiry")!.summary} When it lapses the site shows a full-page security warning.`, findingIds: ["cert-expiry"] });
  }

  if (failed(get("indexable")) || get("robots-txt")?.severity === "critical") {
    issues.push({ tone: "bad", headline: "The site is hidden from Google", detail: "A noindex tag or a robots.txt rule tells search engines not to list it.", findingIds: ["indexable", "robots-txt"] });
  }

  // 2. Structural SEO problems that make every other SEO fix pointless.
  if (failed(get("thin-homepage"))) {
    issues.push({
      tone: "bad",
      headline: "Google sees a splash screen, not your website",
      detail: "The homepage is an intro page with almost no text. Your real homepage sits behind an extra click, so it is hard for Google to rank.",
      findingIds: ["thin-homepage"],
    });
  }
  if (failed(get("query-gated-routes"))) {
    issues.push({
      tone: "bad",
      headline: "Pages only work with a special link",
      detail: `${get("query-gated-routes")!.summary} Clean links shared on WhatsApp or found on Google open the wrong page.`,
      findingIds: ["query-gated-routes"],
    });
  }
  const sameTitles = failed(get("page-titles"));
  const sameDescs = failed(get("page-descriptions"));
  if (sameTitles || sameDescs) {
    issues.push({
      tone: "warn",
      headline: "Your pages look identical in search results",
      detail: [sameTitles && get("page-titles")!.summary, sameDescs && get("page-descriptions")!.summary].filter(Boolean).join(" "),
      findingIds: ["page-titles", "page-descriptions"],
    });
  }
  if (failed(get("robots-txt")) && failed(get("sitemap"))) {
    issues.push({ tone: "warn", headline: "Search engines have no map of your site", detail: "There is no robots.txt and no sitemap.xml, so Google has to discover pages on its own.", findingIds: ["robots-txt", "sitemap"] });
  }
  if (failed(get("broken-links"))) {
    issues.push({ tone: "warn", headline: "Visitors hit broken pages", detail: get("broken-links")!.summary, findingIds: ["broken-links"] });
  }

  // 3. Speed, described in terms a business owner feels.
  const mobile = get("psi-mobile");
  const weight = get("page-weight");
  const lcp = get("lcp");
  if (flagged(mobile) || failed(weight) || failed(lcp)) {
    const bits = [mobile && flagged(mobile) && `Mobile speed ${mobile.summary.split(" on ")[0]}`, failed(lcp) && `main content appears after ${lcp!.summary.split(" (")[0]}`, failed(weight) && `page weighs ${weight!.summary.split(" (")[0]}`].filter(Boolean);
    issues.push({
      tone: failed(mobile) || failed(lcp) ? "bad" : "warn",
      headline: "Slow on phones",
      detail: `${bits.join(", ")}. Most visitors give up on pages that take more than 3 seconds.`,
      findingIds: ["psi-mobile", "lcp", "page-weight", "image-formats"],
    });
  }

  if (failed(get("canonical-host"))) {
    issues.push({ tone: "warn", headline: "Two copies of your site exist", detail: get("canonical-host")!.summary, findingIds: ["canonical-host"] });
  }

  const missingHeaders = findings.filter((f) => f.category === "security" && failed(f));
  if (missingHeaders.length >= 3) {
    issues.push({
      tone: "warn",
      headline: `${missingHeaders.length} basic security protections are switched off`,
      detail: `${missingHeaders.map((f) => f.title).join(", ")}. Each is a one-line server setting.`,
      findingIds: missingHeaders.map((f) => f.id),
    });
  }

  if (flagged(get("analytics"))) {
    issues.push({ tone: "warn", headline: "Some visitors are not tracked", detail: get("analytics")!.summary, findingIds: ["analytics"] });
  }
  if (failed(get("dmarc")) || failed(get("spf"))) {
    issues.push({ tone: "warn", headline: "Scammers can send email as your domain", detail: [get("spf"), get("dmarc")].filter(failed).map((f) => f!.summary).join(" "), findingIds: ["spf", "dmarc"] });
  }
  if (failed(get("form-labels"))) {
    issues.push({ tone: "warn", headline: "Forms are hard to use with a screen reader", detail: get("form-labels")!.summary, findingIds: ["form-labels"] });
  }

  // What is going well, so the report is not only bad news.
  const exposureChecks = findings.filter((f) => f.category === "exposure");
  if (exposureChecks.length && exposureChecks.every(passed)) {
    goods.push({ tone: "good", headline: "No leaked files found", detail: "None of the common secret, backup or debug files are downloadable.", findingIds: exposureChecks.map((f) => f.id) });
  }
  if (passed(get("cert-valid")) && passed(get("cert-expiry")) && passed(get("http-redirect"))) {
    goods.push({ tone: "good", headline: "HTTPS is set up correctly", detail: `Valid certificate, ${get("cert-expiry")!.summary.toLowerCase()} HTTP redirects to HTTPS.`, findingIds: ["cert-valid", "cert-expiry", "http-redirect"] });
  }
  if (passed(get("broken-links")) && pages.length > 2) {
    goods.push({ tone: "good", headline: "No broken pages", detail: get("broken-links")!.summary, findingIds: ["broken-links"] });
  }
  if (passed(mobile)) goods.push({ tone: "good", headline: "Fast on phones", detail: mobile!.summary, findingIds: ["psi-mobile"] });
  if (passed(get("psi-a11y"))) goods.push({ tone: "good", headline: "Accessible to most visitors", detail: `Lighthouse accessibility ${get("psi-a11y")!.summary}`, findingIds: ["psi-a11y"] });

  const order = { bad: 0, warn: 1, good: 2 } as const;
  const top = issues.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, max);
  return [...top, ...goods.slice(0, Math.max(1, max - top.length > 2 ? 3 : 2))];
}
