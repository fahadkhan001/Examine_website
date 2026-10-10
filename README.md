# ExamWeb

**Examine any website in 30 seconds.** ExamWeb is a free website audit web app. Enter a URL and get one score from A to F, plain-language key insights, and the exact fix for every problem it finds across security, exposed files, SSL, SEO, speed and accessibility.

It is built to double as a lead magnet: the score and issue list are free, an email address unlocks the full details and a branded PDF, and site owners can turn on monitoring that emails them when something breaks.

---

## Contents

- [Features](#features)
- [What gets checked](#what-gets-checked)
- [Tech stack](#tech-stack)
- [Setup on your computer](#setup-on-your-computer)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Deploy to Vercel](#deploy-to-vercel)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Features

| Feature | What it does |
|---|---|
| **Website audit** | 68 read-only checks run in parallel. Results stream in live while the scan runs. |
| **Score and grade** | Weighted score per category and overall (0–100, A–F). Any critical failure caps the grade at C. |
| **Key insights** | The 3–5 things that matter most, written for a site owner, not a developer. |
| **Fix instructions** | Every issue explains why it matters and gives a copy-paste fix (Apache, Nginx, HTML, DNS). |
| **Pages scanned** | Crawls up to 25 internal pages: status, redirects, title, meta description, H1, canonical, response time per route. |
| **Security headers grade** | A+ to F, in the style of securityheaders.com, with raw response headers, IP address and "upcoming" headers. |
| **Compare two sites** | Your site vs a competitor: verdict, category bars, key numbers in plain words, header-by-header and check-by-check tables. |
| **Email gate (leads)** | Score and issue titles are free; an email unlocks details, PDF and monitoring. Leads are stored and exportable. |
| **PDF report** | Branded PDF with score, insights, all issues with fixes, and the pages table. |
| **Monitoring** | Daily or weekly re-checks with email alerts for downtime, SSL expiry, new exposed files, lost sitemap, security regressions or score drops. |
| **Admin** | `/admin` shows leads, monitors and recent scans, with CSV export. |
| **Light / Dark / Auto** | White mode by default, switcher in the header. |

## What gets checked

| Category | Checks |
|---|---|
| **Security headers** (14) | HTTPS, HTTP→HTTPS redirect, HSTS, Content-Security-Policy (and whether it actually restricts scripts), clickjacking protection, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, cross-origin headers (COOP/CORP/COEP), deprecated headers, duplicate headers, server version leaks, cookie flags, mixed content |
| **Exposed files** (6) | `.env` and config backups, `.git`, backup archives and SQL dumps, phpinfo/logs/server-status, `composer.json`/`package.json`/`.DS_Store`, directory listings. Every hit is confirmed by file content, not just status code. |
| **SSL & domain** (7) | Certificate validity, expiry, TLS version, www vs non-www, redirect chain length, SPF, DMARC |
| **SEO** (22) | Title, meta description, H1, splash/gate homepage, HTML structure, canonical, noindex, Open Graph/Twitter cards, JSON-LD, analytics/GTM tags, favicon, robots.txt, sitemap, real 404s, broken links, internal redirects, pages that only work with a URL parameter, and per-page titles, descriptions, H1s, canonicals and noindex |
| **Performance** (13) | Mobile and desktop Lighthouse scores, LCP, CLS, INP/TBT, server response, slow inner pages, page weight, request count, compression, caching, image formats, render-blocking scripts |
| **Accessibility** (6) | Lighthouse accessibility score, image alt text, form labels, link and button names, page language, mobile viewport and zoom |

All checks are passive: ordinary GET/HEAD requests to public URLs, like a browser or search engine. ExamWeb never logs in, submits forms or exploits anything, and it never stores the contents of exposed files.

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling:** Tailwind CSS 4 with design tokens in `src/app/globals.css`
- **Database:** Postgres via Drizzle ORM. Locally it uses **PGlite**, an embedded Postgres that stores files in `./.data`, so no database server is needed.
- **HTML parsing:** cheerio
- **Speed data:** Google PageSpeed Insights API, with a local Lighthouse fallback in development
- **PDF:** `@react-pdf/renderer` (no headless browser needed)
- **Email:** Resend (emails print to the console when no key is set)
- **Bot protection:** Cloudflare Turnstile (optional)
- **Tests:** Vitest (unit) and Playwright (end-to-end)

---

## Setup on your computer

### 1. Requirements

- **Node.js 20.9 or newer.** Check with `node -v`. Download from [nodejs.org](https://nodejs.org).
- **Git**
- **Google Chrome** (optional) — only needed for the local Lighthouse speed fallback.

### 2. Get the code

```bash
git clone https://github.com/fahadkhan001/Examine_website.git
cd Examine_website
```

### 3. Install packages

```bash
npm install
```

### 4. Create your local settings file

```bash
cp .env.example .env.local
```

Every value is optional for local use. A good starting `.env.local`:

```bash
ADMIN_PASSWORD=choose-a-password
CRON_SECRET=any-random-string
APP_URL=http://localhost:3000
```

`.env.local` is git-ignored. Never commit real keys or passwords.

### 5. Start the app

```bash
npm run dev
```

Open http://localhost:3000.

If port 3000 is already used by another project, pick a different port and update `APP_URL` to match:

```bash
npx next dev -p 3200
```

### 6. Try it

- **Scan:** enter a website on the homepage, for example `example.com`.
- **Unlock:** enter any email to see the full report, PDF and monitoring options.
- **Compare:** open `/compare` and enter two websites.
- **Admin:** open `/admin`, any username, password = `ADMIN_PASSWORD`.
- **Emails:** with no `RESEND_API_KEY`, emails (including confirmation links) are printed in the terminal running `npm run dev`.

### What runs without any setup

| Piece | Without configuration |
|---|---|
| Database | Embedded PGlite in `./.data`, created and migrated automatically. Delete the folder to reset. |
| Emails | Printed to the server console |
| Bot protection | Skipped |
| Speed (Lighthouse) | Google's keyless quota is tiny, so ExamWeb runs Lighthouse locally with your installed Chrome. Add `PSI_API_KEY` to use Google instead. |

---

## Environment variables

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | Production | Postgres connection string (Neon, Supabase, RDS). Empty = embedded PGlite. |
| `TOKEN_SECRET` | Production | Signs cookies and email links. Generate with `openssl rand -hex 32`. |
| `APP_URL` | Production | Public URL used in emails and PDFs, e.g. `https://examweb.app`. |
| `CRON_SECRET` | Production | Protects the monitoring cron endpoint. `openssl rand -hex 32`. |
| `ADMIN_PASSWORD` | Production | Password for `/admin`. Admin is disabled when empty. |
| `PSI_API_KEY` | Recommended | Google PageSpeed Insights key ([free](https://developers.google.com/speed/docs/insights/v5/get-started), 25,000 requests/day). |
| `RESEND_API_KEY` | Recommended | Sends real emails via [Resend](https://resend.com). |
| `EMAIL_FROM` | With Resend | Sender, e.g. `ExamWeb <reports@yourdomain.com>`. The domain must be verified in Resend. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Recommended | Cloudflare Turnstile bot protection on scan and unlock. |
| `EXAMWEB_SCANS_PER_HOUR` / `EXAMWEB_SCANS_PER_DAY` | Optional | Free scan limits per visitor (default 5 and 20). Raise them for local testing. |
| `EXAMWEB_DISABLE_PSI=1` | Optional | Skip all speed tests (faster local testing). |
| `EXAMWEB_LOCAL_LIGHTHOUSE=0` / `1` | Optional | Force the local Lighthouse fallback off or on. |
| `EXAMWEB_ALLOW_PRIVATE_TARGETS=1` | Tests only | Disables the SSRF guard. **Never set this in production.** |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build / run it |
| `npm run audit -- example.com` | Run an audit in the terminal, no web app or database needed. Add `--json` for raw output. |
| `npm test` | Unit tests (every check with pass/fail fixtures, SSRF guard, scoring, insights, compare, header grade, PDF) |
| `npm run test:e2e` | Playwright browser test: scan → locked report → unlock → PDF (needs internet) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm run db:generate` | Create a migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

---

## Deploy to Vercel

1. Create a Postgres database ([Neon](https://neon.tech) free tier works) and copy its connection string.
2. In [Vercel](https://vercel.com), click **Add New → Project** and import this GitHub repository.
3. Under **Environment Variables**, add `DATABASE_URL`, `TOKEN_SECRET`, `CRON_SECRET`, `ADMIN_PASSWORD`, `PSI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, the two Turnstile keys, and `APP_URL` if you use a custom domain.
4. Click **Deploy**. `vercel.json` applies database migrations before every build and schedules the daily monitoring cron (`/api/cron/monitor`).

Notes:

- Each audit runs in the request's `after()` callback within Vercel's 60-second limit.
- Local Lighthouse is switched off in production, so set `PSI_API_KEY` for speed data.
- Other Node hosts work too: `npm run build && npm start`, then call `GET /api/cron/monitor` daily with the header `Authorization: Bearer <CRON_SECRET>`.

---

## Project structure

```
src/
  app/                    pages and API routes (Next.js App Router)
    page.tsx              landing page
    r/[id]/               report page
    compare/              compare form, and compare/[a]/[b] results
    admin/                leads, monitors, recent scans
    monitors/manage/      manage a monitor from an email link
    api/audits/           start a scan, get results, unlock, PDF, email
    api/compare/          start a two-site comparison
    api/monitors/         subscribe, confirm, manage, unsubscribe
    api/cron/monitor/     scheduled monitoring runs
    api/admin/leads/      leads CSV export
  components/             UI: report, compare, insights, headers panel, pages table, theme switch…
  lib/
    audit/
      safe-fetch.ts       the only HTTP client, with SSRF protection
      context.ts          fetches homepage, robots, sitemap, TLS, DNS, crawl, speed data once
      checks/*.ts         the 68 checks, one file per category
      runner.ts           runs checks in parallel within a time budget
      score.ts            category and overall scores
      insights.ts         plain-language key insights
      headers.ts          security headers grade
      compare.ts          comparison logic
      psi.ts              Google PageSpeed Insights
      lighthouse-local.ts local Lighthouse fallback (development)
    db/                   Drizzle schema and database client
    server/               audits, leads, monitoring, tokens, sessions, rate limits
    pdf/                  PDF report
    email/                email sending and templates
    config.ts             brand name, tagline, limits
  proxy.ts                password protection for /admin
drizzle/                  SQL migrations
scripts/                  CLI audit and migration scripts
tests/                    unit and end-to-end tests
```

---

## How it works

**Scanning.** `POST /api/audits` validates the URL, checks rate limits, saves an audit row and starts the checks in the background. The report page polls for progress. A repeat scan of the same site within 10 minutes returns the cached report; **Re-scan** skips the cache.

**Safety (SSRF).** User-supplied URLs must never reach internal servers. Every request goes through `safe-fetch.ts`, which checks every resolved IP inside the socket's DNS lookup (blocking private, loopback and cloud-metadata addresses, including DNS rebinding), re-checks each redirect hop, only allows ports 80/443/8080/8443, and caps time, body size and decompressed size.

**Email gate.** Until a visitor enters an email, the API sends only each finding's title, status and severity; evidence and fixes never reach the browser. A signed `ew_lead` cookie then unlocks every report that visitor opens, and records a lead for each.

**Monitoring.** Double opt-in by email. Each run is compared with the last successful audit, and alerts are sent for regressions. The same alert is not repeated within 20 hours. Daily monitors email only on alerts; weekly monitors always send a summary. Every email has manage and one-click unsubscribe links.

**Privacy.** Visitor IPs are stored only as salted hashes for rate limiting. See `/privacy`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Another app opens on localhost:3000 | Run `npx next dev -p 3200`, set `APP_URL=http://localhost:3200` in `.env.local`, open http://localhost:3200 |
| Speed checks show "n/a" or "quota exceeded" | Add `PSI_API_KEY`, or install Google Chrome for the local Lighthouse fallback |
| "You have reached the free limit" while testing | Set `EXAMWEB_SCANS_PER_HOUR=200` and `EXAMWEB_SCANS_PER_DAY=1000` in `.env.local` and restart |
| Want a clean local database | Stop the server, delete `.data/`, start again |
| `/admin` says "Admin is disabled" | Set `ADMIN_PASSWORD` in `.env.local` and restart |
| A site "could not be reached" | It may block automated visitors, be offline, or only work on a private network |

---

## Contributing

1. Pull the latest code: `git pull`
2. Create a branch: `git checkout -b my-change`
3. Make your change, then run `npm run lint && npm test`
4. Commit and push: `git add . && git commit -m "Describe the change" && git push -u origin my-change`
5. Open a Pull Request on GitHub

**Adding a check:** add an object to the right file in `src/lib/audit/checks/` with `id`, `category`, `title`, `severity`, `weight`, `whyItMatters`, `howToFix`, an optional `fixSnippet`, and a `run(ctx)` function returning `{ status, summary, evidence? }`. Add a pass and a fail test in `tests/unit/checks.test.ts`.

**Branding:** change the name, tagline and support email in `src/lib/config.ts`, and colors at the top of `src/app/globals.css`.
