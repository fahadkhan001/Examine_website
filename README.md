# ExamWeb

Free website audit web app. A visitor enters a URL and gets a scored report covering security headers, exposed files, SSL and domain, SEO, performance and accessibility. Email unlocks the full report and a PDF. Monitoring re-runs the audit on a schedule and emails alerts when something breaks.

Stack: Next.js 16 (App Router), Tailwind CSS 4, Drizzle ORM on Postgres (with embedded PGlite for local dev), `@react-pdf/renderer`, Resend, Cloudflare Turnstile, Vitest and Playwright.

## Run locally

```bash
npm install
cp .env.example .env.local   # every value is optional locally
npm run dev                  # http://localhost:3000
```

With no configuration:

- The database is embedded PGlite in `./.data`. It migrates itself on first use.
- Emails (report, monitoring confirmation, alerts) are printed to the server console with their links.
- Turnstile bot checks are skipped.
- PageSpeed Insights runs without a key. The keyless quota is tiny, so speed checks often show "n/a". Add `PSI_API_KEY` (free) to get them.

Admin lives at `/admin` once `ADMIN_PASSWORD` is set. It uses HTTP basic auth and accepts any username.

### Useful commands

| Command | What it does |
|---|---|
| `npm run audit -- example.com` | Run an audit in the terminal, without the web app or database. Add `--json` for raw output. |
| `npm test` | Unit tests: every check (pass and fail fixtures), SSRF guard, scoring, monitoring diff, tokens. |
| `npm run test:e2e` | Playwright: scan, locked report, unlock, PDF. Needs network access. |
| `npm run typecheck` | Generate route types and run `tsc`. |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts`. |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL`. |

## Deploy to Vercel

1. Create a Postgres database. Neon's free tier works. Copy the connection string.
2. Import the repository in Vercel and set these environment variables:
   - `DATABASE_URL`
   - `TOKEN_SECRET` (`openssl rand -hex 32`)
   - `CRON_SECRET` (`openssl rand -hex 32`)
   - `ADMIN_PASSWORD`
   - `PSI_API_KEY` ([get one](https://developers.google.com/speed/docs/insights/v5/get-started))
   - `RESEND_API_KEY` and `EMAIL_FROM` (verify your sending domain in Resend)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
   - `APP_URL` if you use a custom domain
3. Deploy. `vercel.json` runs migrations before every build and registers the daily monitoring cron.

The audit runs inside the request's `after()` callback with `maxDuration = 60`. That fits Vercel Hobby. On any other Node host, run `npm run build && npm start` and call `/api/cron/monitor` from a scheduler with `Authorization: Bearer $CRON_SECRET`.

## How it works

```
src/lib/audit/
  safe-fetch.ts     the only HTTP client: SSRF guard checks every resolved IP inside the socket lookup,
                    re-checks every redirect hop, caps time, body size and decompressed size
  context.ts        fetches shared inputs once (homepage, robots, sitemap, TLS, DNS, PSI, crawl);
                    everything except the homepage is lazy and memoized
  checks/*.ts       55 checks; each one is { id, category, severity, weight, copy, run(ctx) }
  runner.ts         runs checks 6 at a time inside a 45 s budget; a check that throws becomes "n/a"
  score.ts          weighted category scores into an overall score; a critical failure caps the grade at C
src/lib/server/     audits, leads, monitoring (diff + alerts), signed tokens, session cookie
src/lib/pdf/        branded PDF report
src/lib/email/      email templates (inline-styled HTML + plain text)
src/app/api/        route handlers
src/proxy.ts        basic auth for /admin
```

**Gating.** Until a visitor gives an email, the API returns only each finding's title, status and severity. Evidence and fixes never reach the browser. The signed `ew_lead` cookie unlocks every report the visitor opens later and records a lead for each one.

**Monitoring.** Double opt-in by email. Each run is compared with the last successful audit. An alert fires for: site down, SSL invalid or expiring within 14 days, a new exposed file, a lost sitemap or robots.txt, noindex, a security regression, or a score drop of 10+ points. The same alert kind is not repeated within 20 hours. Daily monitors email only on alerts. Weekly monitors always send a summary. Every email has manage and one-click unsubscribe links (RFC 8058). The cron handles 3 monitors per call and calls itself again while more are due. To run one monitor immediately: `GET /api/cron/monitor?monitor=<id>`.

**Abuse limits.** Turnstile on scan and unlock. 5 scans per hour and 20 per day per IP. Only a salted hash of the IP is stored. A repeat scan of the same site within 10 minutes returns the cached report.

**Exposed files.** Each hit is confirmed by the file's content (for example `ref: refs/` for `.git/HEAD`, or zip magic bytes for backups), so sites that answer 200 for every path do not produce false positives. Only GET requests are sent, and file contents are never stored.

## Branding

Change the name, tagline and support email in `src/lib/config.ts`. Colors are CSS tokens at the top of `src/app/globals.css`, with matching light and dark sets.
