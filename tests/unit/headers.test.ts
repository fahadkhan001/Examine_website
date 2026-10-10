import { describe, expect, it } from "vitest";
import { CHECK_BY_ID } from "@/lib/audit/checks";
import { buildHeaderReport } from "@/lib/audit/headers";
import type { Finding } from "@/lib/audit/types";
import { fakeContext, fakeResponse } from "./fake-context";

const run = (id: string, ctx: ReturnType<typeof fakeContext>) => Promise.resolve(CHECK_BY_ID.get(id)!.run(ctx));
const pass = (id: string): Finding => ({ id, category: "security", status: "pass", severity: "low", weight: 1, title: id, summary: "", whyItMatters: "", howToFix: "" });

const ALL = {
  "content-security-policy": "default-src 'self'",
  "strict-transport-security": "max-age=31536000",
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()",
};

describe("header grade", () => {
  it("gives A+ for all six headers, HTTPS and no warnings", () => {
    const r = buildHeaderReport(fakeResponse({ headers: ALL }), ["csp", "hsts", "framing", "nosniff", "referrer-policy", "permissions-policy"].map(pass));
    expect(r.grade).toBe("A+");
    expect(r.upcoming.every((u) => !u.present)).toBe(true);
  });

  it("drops a grade per missing header", () => {
    expect(buildHeaderReport(fakeResponse({ headers: { "x-content-type-options": "nosniff" } }), []).grade).toBe("F");
    const { "permissions-policy": _p, ...five } = ALL;
    void _p;
    expect(buildHeaderReport(fakeResponse({ headers: five }), []).grade).toBe("B");
  });

  it("does not count a CSP that restricts nothing", () => {
    const failCsp: Finding = { ...pass("csp"), status: "fail" };
    const r = buildHeaderReport(fakeResponse({ headers: { ...ALL, "content-security-policy": "upgrade-insecure-requests" } }), [failCsp]);
    expect(r.core.find((c) => c.name === "Content-Security-Policy")).toMatchObject({ present: true, counts: false, weak: true });
    expect(r.grade).toBe("B");
  });
});

describe("new header checks", () => {
  it("flags deprecated, duplicate and invalid headers", async () => {
    const ctx = fakeContext({
      headers: { "x-xss-protection": "1; mode=block", "expect-ct": "max-age=0", "x-frame-options": ["SAMEORIGIN", "DENY"], "x-content-type-options": "yes" },
    });
    expect((await run("deprecated-headers", ctx)).status).toBe("warn");
    expect((await run("duplicate-headers", ctx)).evidence).toContain("x-frame-options × 2");
    expect((await run("framing", ctx)).status).toBe("warn");
    expect((await run("nosniff", ctx)).status).toBe("warn");
    expect((await run("cross-origin", ctx)).status).toBe("warn");
  });

  it("warns on Referrer-Policy: origin and uses the last value of a list", async () => {
    expect((await run("referrer-policy", fakeContext({ headers: { "referrer-policy": "origin" } }))).status).toBe("warn");
    expect((await run("referrer-policy", fakeContext({ headers: { "referrer-policy": "unsafe-url, strict-origin-when-cross-origin" } }))).status).toBe("pass");
  });
});
