import type { Metadata } from "next";
import { brand } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-ink-2 [&_h2]:mt-8 [&_h2]:font-semibold [&_h2]:text-ink">
        <p>{brand.name} audits public websites. This page explains what we store.</p>
        <h2>When you scan a site</h2>
        <p>We store the URL, the audit results and a salted hash of your IP address (used only for rate limiting). We never store raw IP addresses. Reports are reachable by anyone with the link.</p>
        <h2>When you unlock a report</h2>
        <p>We store your email address, and your name and company if you give them, together with the report you unlocked. We use them to send what you ask for. We send marketing email only if you tick the box, and every email has an unsubscribe link.</p>
        <h2>When you turn on monitoring</h2>
        <p>We store your email, the site URL and the check frequency, and send alerts after you confirm by email. You can pause or delete monitoring from the link in any alert.</p>
        <h2>The sites we scan</h2>
        <p>We send ordinary read-only requests. When an exposed-file check finds a sensitive file, we record only that it is reachable, not its contents.</p>
        <h2>Contact</h2>
        <p>To delete your data, email <a className="underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
      </div>
    </main>
  );
}
