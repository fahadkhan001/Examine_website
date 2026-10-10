"use client";

import { useState } from "react";
import type { PageRow } from "@/lib/audit/types";
import { cx } from "./ui";

const path = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

type Level = "ok" | "warn" | "bad";
const tone: Record<Level, string> = { ok: "text-ink-2", warn: "text-medium", bad: "text-critical" };

function statusLevel(p: PageRow): Level {
  if (p.error || (p.status ?? 0) >= 400) return "bad";
  if (p.redirects > 0) return "warn";
  return "ok";
}

function descLevel(p: PageRow, dupDescs: Set<string>): Level {
  if (!p.description) return "bad";
  if (dupDescs.has(p.description)) return "warn";
  return p.description.length < 50 || p.description.length > 170 ? "warn" : "ok";
}

function titleLevel(p: PageRow, dupTitles: Set<string>): Level {
  if (!p.title) return "bad";
  if (dupTitles.has(p.title)) return "warn";
  return p.title.length < 15 || p.title.length > 65 ? "warn" : "ok";
}

/** Every crawled route with its status, redirects and on-page SEO facts. */
export function PagesTable({ pages }: { pages: PageRow[] }) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const html = pages.filter((p) => !p.error?.startsWith("skipped"));
  const counts = new Map<string, number>();
  for (const p of html) if (p.title) counts.set(p.title, (counts.get(p.title) ?? 0) + 1);
  const dupTitles = new Set([...counts].filter(([, n]) => n > 1).map(([t]) => t));
  const descCounts = new Map<string, number>();
  for (const p of html) if (p.description) descCounts.set(p.description, (descCounts.get(p.description) ?? 0) + 1);
  const dupDescs = new Set([...descCounts].filter(([, n]) => n > 1).map(([d]) => d));

  const isContent = (p: PageRow) => !p.error && (p.status ?? 0) < 400;
  const hasProblem = (p: PageRow) =>
    statusLevel(p) !== "ok" ||
    (isContent(p) && (descLevel(p, dupDescs) !== "ok" || titleLevel(p, dupTitles) !== "ok" || p.h1Count !== 1 || p.noindex || (p.ttfbMs ?? 0) > 1500));
  const rows = onlyProblems ? html.filter(hasProblem) : html;
  const problemCount = html.filter(hasProblem).length;

  return (
    <section aria-labelledby="pages-heading">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3 px-1">
        <h2 id="pages-heading" className="text-[15px] font-semibold">
          Pages scanned
          <span className="ml-2 text-[13px] font-normal text-muted">
            {html.length} routes · {problemCount} with problems
          </span>
        </h2>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-[var(--accent)]" />
          Only pages with problems
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="border-b border-line bg-sunken/50 font-mono text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Route</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Meta description</th>
              <th className="px-3 py-2 font-medium">H1</th>
              <th className="px-3 py-2 text-right font-medium">Response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => {
              const ok = isContent(p);
              const tl = titleLevel(p, dupTitles);
              const dl = descLevel(p, dupDescs);
              return (
                <tr key={p.url} className="align-top">
                  <td className="max-w-[220px] px-4 py-2.5">
                    <a href={p.finalUrl ?? p.url} target="_blank" rel="noreferrer" className="break-all font-mono text-[12.5px] text-ink hover:underline">
                      {path(p.url)}
                    </a>
                    {p.redirects > 0 && p.finalUrl && (
                      <div className="mt-0.5 break-all font-mono text-[11px] text-medium">→ {path(p.finalUrl)}{p.redirects > 1 ? ` (${p.redirects} hops)` : ""}</div>
                    )}
                    {p.noindex && <div className="mt-0.5 font-mono text-[11px] text-medium">noindex</div>}
                    {p.foundOn === "sitemap" && <div className="mt-0.5 font-mono text-[11px] text-muted">from sitemap</div>}
                  </td>
                  <td className={cx("whitespace-nowrap px-3 py-2.5 font-mono font-semibold", tone[statusLevel(p)])}>
                    {p.error ? "error" : p.status}
                    {p.redirects > 0 && <span className="ml-1 font-normal">↪</span>}
                  </td>
                  <td className={cx("max-w-[220px] px-3 py-2.5", ok ? tone[tl] : "text-muted")}>
                    {!ok ? "–" : p.title ? (
                      <span title={p.title} className="line-clamp-2">{p.title}{dupTitles.has(p.title) && <span className="ml-1 font-mono text-[11px]">(duplicate)</span>}</span>
                    ) : "missing"}
                  </td>
                  <td className={cx("max-w-[260px] px-3 py-2.5", ok ? tone[dl] : "text-muted")}>
                    {!ok ? (p.error ?? "–") : p.description ? (
                      <span title={p.description} className="line-clamp-2">
                        <span className="mr-1 font-mono text-[11px]">{p.description.length}ch{dupDescs.has(p.description) ? " duplicate" : ""}</span>
                        {p.description}
                      </span>
                    ) : "missing"}
                  </td>
                  <td className={cx("px-3 py-2.5 font-mono", !ok ? "text-muted" : p.h1Count === 1 ? "text-ink-2" : "text-medium")}>
                    {ok ? p.h1Count ?? "–" : "–"}
                  </td>
                  <td className={cx("whitespace-nowrap px-3 py-2.5 text-right font-mono", (p.ttfbMs ?? 0) > 1500 ? "text-critical" : (p.ttfbMs ?? 0) > 800 ? "text-medium" : "text-ink-2")}>
                    {p.ttfbMs !== undefined ? `${p.ttfbMs} ms` : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-[12px] text-muted">
        Routes are found from homepage links, links on crawled pages and the sitemap. Red means broken or missing; amber means a redirect, a length problem or a duplicate.
      </p>
    </section>
  );
}
