import type { Metadata } from "next";
import { CompareForm } from "@/components/CompareForm";
import { CATEGORIES, CATEGORY_META } from "@/lib/audit/types";

export const metadata: Metadata = {
  title: "Compare two websites",
  description: "Put two websites side by side: security, exposed files, SSL, SEO, speed and accessibility, check by check.",
};

const WHAT = [
  ["Verdict", "Overall score, grade and who wins each category."],
  ["Key numbers", "Mobile and desktop speed, LCP, page weight, requests, server response, SSL expiry, broken pages."],
  ["Check by check", "All checks paired up, filtered to the ones where the two sites differ."],
  ["Key insights", "The plain-language takeaways for each site, next to each other."],
];

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const a = typeof sp.a === "string" ? sp.a : "";
  const b = typeof sp.b === "string" ? sp.b : "";
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 font-mono text-xs text-muted">
            <span className="size-1.5 rounded-full bg-side-a" />
            <span className="size-1.5 rounded-full bg-side-b" />
            compare mode
          </p>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
            Your site <span className="text-muted">vs</span> theirs.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink-2 sm:text-lg">
            Run the full audit on two websites at once and see exactly where each one wins: security, SEO, speed and accessibility.
          </p>
          <div className="mx-auto mt-9 max-w-3xl text-left">
            <CompareForm initialA={a} initialB={b} />
          </div>
          <p className="mt-4 font-mono text-xs text-muted">Both sites are scanned in parallel · counts as 2 scans</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {WHAT.map(([t, d]) => (
            <div key={t} className="bg-raised p-6">
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[13px] text-muted">
          Covers {CATEGORIES.map((c) => CATEGORY_META[c].label.toLowerCase()).join(", ")}.
        </p>
      </section>
    </main>
  );
}
