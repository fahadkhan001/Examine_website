/** Brand strings and tunable limits. Change the brand here only. */
export const brand = {
  name: "ExamWeb",
  tagline: "Examine any website in 30 seconds.",
  description:
    "Free website audit: security headers, exposed files, SSL, SEO, performance and accessibility. One score, clear fixes, PDF report.",
  botUserAgent: "ExamWebBot/1.0 (+https://examweb.app/bot)",
  supportEmail: "hello@examweb.app",
};

export const limits = {
  /**
   * Wall-clock budget for one audit. Vercel function maxDuration is 60s.
   * Local dev gets longer because local Lighthouse runs are queued.
   */
  auditBudgetMs: process.env.NODE_ENV === "production" || process.env.VERCEL ? 45_000 : 120_000,
  fetchTimeoutMs: 8_000,
  maxBodyBytes: 3 * 1024 * 1024,
  maxRedirects: 10,
  crawlMaxPages: 25,
  crawlBudgetMs: 20_000,
  checkConcurrency: 6,
  scansPerHour: Number(process.env.EXAMWEB_SCANS_PER_HOUR ?? 5),
  scansPerDay: Number(process.env.EXAMWEB_SCANS_PER_DAY ?? 20),
  /** Re-scan of the same URL within this window returns the cached audit. */
  cacheWindowMs: 10 * 60_000,
  monitorBatchSize: 3,
};

export function appUrl(): string {
  return (
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}
