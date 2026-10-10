import { describe, expect, it } from "vitest";
import { assertFetchableUrl, BlockedTargetError, guardedLookup, isPublicAddress, normalizeInputUrl } from "@/lib/audit/safe-fetch";

describe("isPublicAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(["8.8.8.8", "1.1.1.1", "140.82.121.4", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("assertFetchableUrl", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://user:pass@example.com/",
    "http://example.com:22/",
    "http://intranet/",
  ])("rejects %s", (u) => expect(() => assertFetchableUrl(u)).toThrow(BlockedTargetError));

  it("accepts normal public URLs", () => {
    expect(assertFetchableUrl("https://example.com/path").hostname).toBe("example.com");
    expect(assertFetchableUrl("http://example.com:8080/").port).toBe("8080");
  });
});

describe("normalizeInputUrl", () => {
  it("adds https and strips the hash", () => {
    expect(normalizeInputUrl("  example.com/a#b ").toString()).toBe("https://example.com/a");
  });
  it("rejects garbage", () => {
    expect(() => normalizeInputUrl("")).toThrow();
    expect(() => normalizeInputUrl("not a url")).toThrow();
  });
});

describe("guardedLookup", () => {
  it("refuses hostnames that resolve to private addresses (DNS rebinding guard)", async () => {
    const err = await new Promise<Error | null>((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
    expect(err).toBeInstanceOf(BlockedTargetError);
  });
});
