import { cookies } from "next/headers";
import { sign, verify } from "./tokens";

/**
 * Lead cookie: once a visitor gives their email, every report they open is
 * unlocked (and recorded as a lead for that audit). Signed, httpOnly, 1 year.
 */
const COOKIE = "ew_lead";

export interface LeadSession {
  email: string;
  name?: string;
  company?: string;
  consent?: boolean;
}

export async function getLeadSession(): Promise<LeadSession | null> {
  const jar = await cookies();
  return verify<LeadSession & Record<string, unknown>>(jar.get(COOKIE)?.value);
}

export async function setLeadSession(s: LeadSession): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sign({ ...s }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
