import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Stateless signed tokens (HMAC-SHA256) for cookies and email links. */

function secret(): string {
  const s = process.env.TOKEN_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("TOKEN_SECRET must be set in production");
  return "examweb-dev-secret-change-me";
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(payload: Record<string, unknown>, ttlSeconds?: number): string {
  const body = b64(JSON.stringify(ttlSeconds ? { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds } : payload));
  const mac = b64(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** IPs are never stored raw; only a salted hash for rate limiting. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${secret()}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
