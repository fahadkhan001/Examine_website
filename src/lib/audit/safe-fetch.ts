import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { brand, limits } from "@/lib/config";

/**
 * The only HTTP client the audit engine uses. It exists so that a user-supplied
 * URL can never make our server talk to internal infrastructure (SSRF):
 *  - every resolved IP is validated inside the socket's DNS lookup, so DNS
 *    rebinding between "check" and "connect" is impossible;
 *  - redirects are followed manually and each hop is re-validated;
 *  - time, body size and decompressed size are capped.
 */

export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedTargetError";
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

function allowPrivate(): boolean {
  return process.env.EXAMWEB_ALLOW_PRIVATE_TARGETS === "1";
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  return parsed.range() === "unicast";
}

export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0) {
      return callback(new Error(`No DNS records for ${hostname}`), "", 4);
    }
    if (!allowPrivate()) {
      const bad = list.find((a) => !isPublicAddress(a.address));
      if (bad) {
        return callback(
          new BlockedTargetError(`${hostname} resolves to a non-public address`),
          "",
          4,
        );
      }
    }
    if (options.all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

/** Throws if the URL is not something we are willing to request. */
export function assertFetchableUrl(raw: string | URL): URL {
  const url = typeof raw === "string" ? new URL(raw) : raw;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedTargetError("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new BlockedTargetError("URLs with credentials are not allowed");
  }
  if (!ALLOWED_PORTS.has(url.port) && !allowPrivate()) {
    throw new BlockedTargetError(`Port ${url.port} is not allowed`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !allowPrivate() && !isPublicAddress(host)) {
    throw new BlockedTargetError("Private or reserved IP addresses are not allowed");
  }
  if (!net.isIP(host) && !host.includes(".") && !allowPrivate()) {
    throw new BlockedTargetError("Hostname must be a public domain");
  }
  return url;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Decoded (decompressed) body. Empty for HEAD. */
  body: Buffer;
  /** Bytes on the wire before decompression. */
  transferBytes: number;
  truncated: boolean;
  ttfbMs: number;
  /** Header name/value pairs exactly as sent, duplicates kept. */
  rawHeaders: [string, string][];
  /** IP address we connected to. */
  remoteAddress?: string;
  totalMs: number;
  header(name: string): string | undefined;
  text(): string;
}

export interface RequestOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export function safeRequest(rawUrl: string | URL, opts: RequestOptions = {}): Promise<SafeResponse> {
  const url = assertFetchableUrl(rawUrl);
  const method = opts.method ?? "GET";
  const timeoutMs = opts.timeoutMs ?? limits.fetchTimeoutMs;
  const maxBytes = opts.maxBytes ?? limits.maxBodyBytes;
  const lib = url.protocol === "https:" ? https : http;
  const started = performance.now();

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method,
        lookup: guardedLookup,
        headers: {
          "user-agent": brand.botUserAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-encoding": "br, gzip, deflate",
          "accept-language": "en",
          ...opts.headers,
        },
      },
      (res) => {
        const ttfbMs = performance.now() - started;
        const rawHeaders: [string, string][] = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) rawHeaders.push([res.rawHeaders[i], res.rawHeaders[i + 1]]);
        const remoteAddress = res.socket?.remoteAddress?.replace(/^::ffff:/, "");
        const chunks: Buffer[] = [];
        let decodedBytes = 0;
        let transferBytes = 0;
        let truncated = false;

        res.on("data", (c: Buffer) => {
          transferBytes += c.length;
        });

        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        const hasBody = method !== "HEAD" && res.statusCode !== 204 && res.statusCode !== 304;
        if (!hasBody) stream = res;
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
        else if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());

        const finish = () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks);
          const headers = res.headers;
          resolve({
            url: url.toString(),
            status: res.statusCode ?? 0,
            headers,
            body,
            transferBytes,
            truncated,
            ttfbMs,
            rawHeaders,
            remoteAddress,
            totalMs: performance.now() - started,
            header(name) {
              const v = headers[name.toLowerCase()];
              return Array.isArray(v) ? v.join(", ") : v;
            },
            text() {
              return body.toString("utf8");
            },
          });
        };

        stream.on("data", (c: Buffer) => {
          if (truncated) return;
          decodedBytes += c.length;
          if (decodedBytes > maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, c.length - (decodedBytes - maxBytes)));
            res.destroy();
            finish();
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => !truncated && finish());
        stream.on("error", () => {
          // A broken compressed stream still gives us valid headers; keep what we have.
          if (!truncated) {
            truncated = true;
            finish();
          }
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

export interface RedirectHop {
  url: string;
  status: number;
  location?: string;
}

export interface FetchResult {
  response: SafeResponse;
  chain: RedirectHop[];
}

/** GET/HEAD with manual redirect following; every hop is validated. */
export async function safeFetch(rawUrl: string | URL, opts: RequestOptions = {}): Promise<FetchResult> {
  const chain: RedirectHop[] = [];
  let current = new URL(rawUrl.toString());
  for (let i = 0; i <= limits.maxRedirects; i++) {
    const response = await safeRequest(current, opts);
    const location = response.header("location");
    if (response.status >= 300 && response.status < 400 && location) {
      chain.push({ url: current.toString(), status: response.status, location });
      current = new URL(location, current);
      continue;
    }
    chain.push({ url: current.toString(), status: response.status });
    return { response, chain };
  }
  throw new Error(`Too many redirects (>${limits.maxRedirects})`);
}

/** Normalizes user input like "example.com/path" into a URL, or throws. */
export function normalizeInputUrl(input: string): URL {
  let s = input.trim();
  if (!s) throw new BlockedTargetError("Enter a website address");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new BlockedTargetError("That does not look like a valid website address");
  }
  url.hash = "";
  return assertFetchableUrl(url);
}
