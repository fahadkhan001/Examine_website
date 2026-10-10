import Link from "next/link";
import { CategoryBars } from "@/components/CategoryBars";
import { FindingCard } from "@/components/FindingCard";
import { ScoreRing } from "@/components/ScoreRing";
import { UrlForm } from "@/components/UrlForm";
import { ALL_CHECKS } from "@/lib/audit/checks";
import { CATEGORIES, CATEGORY_META, type CategoryScore, type Finding } from "@/lib/audit/types";
import { brand } from "@/lib/config";

const SAMPLE_SCORES: CategoryScore[] = [
  { category: "security", score: 41, passed: 4, warnings: 2, failed: 5 },
  { category: "exposure", score: 62, passed: 5, warnings: 0, failed: 1 },
  { category: "ssl", score: 88, passed: 6, warnings: 1, failed: 0 },
  { category: "seo", score: 70, passed: 8, warnings: 3, failed: 2 },
  { category: "performance", score: 54, passed: 5, warnings: 4, failed: 3 },
  { category: "accessibility", score: 83, passed: 4, warnings: 2, failed: 0 },
];

function sample(id: string, patch: Partial<Finding>): Finding {
  const def = ALL_CHECKS.find((c) => c.id === id)!;
  return {
    id,
    category: def.category,
    title: def.title,
    weight: def.weight,
    whyItMatters: def.whyItMatters,
    howToFix: def.howToFix,
    fixSnippet: def.fixSnippet,
    severity: def.severity,
    status: "fail",
    summary: "",
    ...patch,
  };
}

const SAMPLE_FINDINGS: Finding[] = [
  sample("exposed-git", { summary: "1 sensitive file(s) can be downloaded.", evidence: "• https://shop.example/.git/config" }),
  sample("hsts", { summary: "Header is missing." }),
  sample("sitemap", { summary: "No valid sitemap at /sitemap.xml or in robots.txt." }),
];

const STEPS = [
  { n: "01", title: "Enter a URL", body: "Any public website. No signup, no code to install, nothing to configure." },
  { n: "02", title: "We run every check", body: `${ALL_CHECKS.length} read-only checks run in parallel from our servers, plus Google Lighthouse for speed.` },
  { n: "03", title: "Fix what matters", body: "One score, issues ranked by impact, and copy-paste fixes for Apache, Nginx and common stacks." },
];

const ALERTS = [
  ["Site down", "Homepage stops responding or returns errors"],
  ["SSL expiring", "Certificate has fewer than 14 days left"],
  ["New exposed file", ".env, .git, backups or SQL dumps become downloadable"],
  ["SEO regression", "Sitemap disappears, robots.txt blocks crawlers, noindex added"],
  ["Security regression", "A security header is removed after a deploy"],
  ["Score drop", "Overall score falls 10 points or more"],
];

const FAQ = [
  ["Is it safe to scan my site?", "Yes. We only send ordinary read requests to public URLs, the same as a browser or search engine. We never log in, submit forms, or try to exploit anything we find."],
  ["Can I scan a site I don't own?", "You can check any public website, the same way anyone can visit it. Exposed-file checks only confirm that a file is publicly downloadable; we do not store its contents."],
  ["Why do you ask for my email?", "The score and issue list are free with no signup. Your email unlocks the full details, fix instructions and PDF, and lets us send monitoring alerts if you turn them on."],
  ["Where do the speed numbers come from?", "Google PageSpeed Insights (Lighthouse), on both mobile and desktop, plus real-user Core Web Vitals when Google has enough data for your site."],
  ["How is the score calculated?", "Each check has a weight inside its category. Passing earns full credit and warnings earn half. Categories are combined with security and exposed files weighted most. Any critical failure caps the grade at C."],
  ["What does monitoring cost?", `It's free while ${brand.name} is in beta. Pick daily or weekly checks, and unsubscribe from any email in one click.`],
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const { url } = await searchParams;
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, ALL_CHECKS.filter((k) => k.category === c)]));

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 font-mono text-xs text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            free website audit · {ALL_CHECKS.length} checks
          </p>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
            Examine any website
            <br />
            <span className="text-muted">in 30 seconds.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink-2 sm:text-lg">
            Security headers, leaked files, SSL, SEO, speed and accessibility. One score, issues ranked by impact, and the exact fix for each.
          </p>
          <div className="mx-auto mt-9 max-w-xl">
            <UrlForm initial={typeof url === "string" ? url : ""} autoFocus />
          </div>
          <p className="mt-4 font-mono text-xs text-muted">No signup to scan · read-only · results in under a minute</p>
          <p className="mt-3 text-sm">
            <Link href="/compare" className="inline-flex items-center gap-1.5 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 transition hover:text-ink hover:decoration-ink">
              <span className="size-1.5 rounded-full bg-side-a" />
              <span className="size-1.5 rounded-full bg-side-b" />
              Compare two websites side by side
            </Link>
          </p>
        </div>
      </section>

      {/* Sample report */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-[28px] border border-line bg-raised/60 p-2 shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="ml-3 truncate font-mono text-xs text-muted">examweb.app/r/sample · shop.example</span>
          </div>
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[280px_1fr] lg:gap-10">
            <div className="rounded-2xl border border-line bg-raised p-5">
              <div className="flex items-center gap-5 lg:flex-col">
                <ScoreRing score={64} grade="D" size={128} />
                <div className="flex-1 lg:w-full">
                  <CategoryBars scores={SAMPLE_SCORES} compact />
                </div>
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Top issues · click to expand</p>
              {SAMPLE_FINDINGS.map((f, i) => (
                <FindingCard key={f.id} finding={f} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What we check */}
      <section id="checks" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-wider text-accent">What we check</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Six areas that decide whether a site is safe, found and fast.</h2>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <article key={c} className="bg-raised p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{CATEGORY_META[c].label}</h3>
                <span className="font-mono text-xs text-muted">{counts[c].length} checks</span>
              </div>
              <p className="mt-1 text-sm text-muted">{CATEGORY_META[c].blurb}</p>
              <ul className="mt-4 space-y-1.5">
                {counts[c].slice(0, 4).map((k) => (
                  <li key={k.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                    <span className="size-1 rounded-full bg-accent" />
                    {k.title}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-raised/50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <span className="font-mono text-sm text-accent">{s.n}</span>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Monitoring */}
      <section id="monitoring" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-accent">Monitoring</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Know when something breaks, before your visitors do.</h2>
            <p className="mt-4 max-w-lg leading-relaxed text-ink-2">
              Turn on daily or weekly re-checks from any report. We compare each run with the last one and email you only what changed.
            </p>
            <dl className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {ALERTS.map(([t, d]) => (
                <div key={t}>
                  <dt className="text-sm font-semibold">{t}</dt>
                  <dd className="text-[13px] text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            <div className="dot-grid absolute -inset-6 rounded-[32px]" />
            <div className="relative rounded-2xl border border-line bg-raised p-5 shadow-card">
              <div className="flex items-center justify-between font-mono text-xs text-muted">
                <span>alerts@examweb</span>
                <span>Mon 09:02</span>
              </div>
              <p className="mt-3 text-[15px] font-semibold">⚠ shop.example: New exposed file</p>
              <div className="mt-3 rounded-xl border-l-[3px] border-critical bg-critical-soft px-3 py-2.5 text-sm">
                <p className="font-medium">Environment and config files not public</p>
                <p className="mt-0.5 font-mono text-xs text-ink-2">https://shop.example/.env</p>
              </div>
              <div className="mt-2 rounded-xl border-l-[3px] border-high bg-high-soft px-3 py-2.5 text-sm">
                <p className="font-medium">SSL certificate expiring</p>
                <p className="mt-0.5 text-xs text-ink-2">Expires in 9 days.</p>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <ScoreRing score={58} grade="F" size={56} />
                <p className="text-sm text-muted">Score 58/100 <span className="text-critical">(−14 since last check)</span></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span className="font-mono text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-line bg-ink text-bg">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50 [--dot:rgba(255,255,255,0.07)] dark:[--dot:rgba(0,0,0,0.07)]" />
        <div className="relative mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">What would we find on your site?</h2>
          <p className="mt-3 text-bg/70">Takes under a minute. No signup needed for the score.</p>
          <div className="mx-auto mt-8 max-w-xl text-left text-ink">
            <UrlForm size="lg" />
          </div>
        </div>
      </section>
    </main>
  );
}
