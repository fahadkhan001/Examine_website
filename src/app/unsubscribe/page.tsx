import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/ui";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      {sp.done !== undefined ? (
        <>
          <h1 className="text-2xl font-semibold">{sp.done === "1" ? "You are unsubscribed" : "Link not valid"}</h1>
          <p className="mt-2 text-muted">
            {sp.done === "1" ? "Monitoring is paused and you will not get further alert emails." : "This unsubscribe link is invalid or incomplete."}
          </p>
          <Link href="/" className={`${button.secondary} mt-6`}>Back to home</Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Stop monitoring emails?</h1>
          <p className="mt-2 text-muted">We will pause monitoring for this site. You can turn it back on from any report.</p>
          <form method="post" action="/api/monitors/unsubscribe" className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={button.primary}>Unsubscribe</button>
          </form>
        </>
      )}
    </main>
  );
}
