"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

/** Header link that shows which section you are in. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/r/") : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3", active ? "bg-sunken text-ink" : "text-muted hover:text-ink")}
    >
      {children}
    </Link>
  );
}
