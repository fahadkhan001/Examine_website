import Link from "next/link";
import { button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-muted">This page or report does not exist.</p>
      <Link href="/" className={`${button.primary} mt-6`}>Scan a website</Link>
    </main>
  );
}
