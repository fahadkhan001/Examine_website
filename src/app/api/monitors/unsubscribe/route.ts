import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/config";
import { readMonitorToken, updateMonitor } from "@/lib/server/monitoring";

/**
 * POST only, so link scanners that pre-fetch email links cannot unsubscribe
 * people. Serves both the unsubscribe page form and RFC 8058 one-click.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = req.nextUrl.searchParams.get("token") ?? (form?.get("token") as string | null);
  const id = readMonitorToken(token, "manage");
  if (id) await updateMonitor(id, { active: false });
  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded") && form?.get("List-Unsubscribe")) {
    return new NextResponse(null, { status: 200 });
  }
  return NextResponse.redirect(`${appUrl()}/unsubscribe?done=${id ? 1 : 0}`, { status: 303 });
}
