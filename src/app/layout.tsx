import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { themeScript, ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/ui";
import { appUrl, brand } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: `${brand.name} — Free website audit: security, SEO, speed`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { title: `${brand.name} — ${brand.tagline}`, description: brand.description, type: "website", siteName: brand.name },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Logo />
            <nav className="flex items-center gap-1 text-sm" aria-label="Main">
              <NavLink href="/">Scan</NavLink>
              <NavLink href="/compare">Compare</NavLink>
              <Link href="/#monitoring" className="hidden rounded-lg px-3 py-1.5 text-muted transition hover:text-ink md:inline">Monitoring</Link>
              <Link href="/#faq" className="hidden rounded-lg px-3 py-1.5 text-muted transition hover:text-ink md:inline">FAQ</Link>
              <span className="ml-1"><ThemeToggle /></span>
            </nav>
          </div>
        </header>
        <div id="content" className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <Logo className="text-ink" />
              <span>Read-only checks. No login, no exploits.</span>
            </div>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <a href={`mailto:${brand.supportEmail}`} className="hover:text-ink">Contact</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
