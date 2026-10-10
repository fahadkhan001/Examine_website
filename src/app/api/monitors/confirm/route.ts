import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/config";
import { confirm, monitorToken, readMonitorToken } from "@/lib/server/monitoring";

export async function GET(req: NextRequest) {
  const id = readMonitorToken(req.nextUrl.searchParams.get("token"), "confirm");
  const m = id ? await confirm(id) : undefined;
  if (!m) return NextResponse.redirect(`${appUrl()}/monitors/manage?error=expired`);
  return NextResponse.redirect(`${appUrl()}/monitors/manage?token=${monitorToken(m.id, "manage")}&confirmed=1`);
}
