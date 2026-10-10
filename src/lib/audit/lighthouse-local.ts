import { execFile } from "node:child_process";
import path from "node:path";

/**
 * Local Lighthouse fallback for development, used when Google PageSpeed
 * Insights is unavailable (no key / quota). Needs Chrome installed on the
 * machine, so it is disabled in production and on serverless hosts.
 *
 * Each run is a separate `lighthouse` CLI process: Lighthouse keeps global
 * timing state, so two in-process runs in one server break each other.
 * Runs are also queued, because two parallel Chrome traces skew the numbers.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function localLighthouseEnabled(): boolean {
  if (process.env.EXAMWEB_LOCAL_LIGHTHOUSE === "0") return false;
  if (process.env.EXAMWEB_LOCAL_LIGHTHOUSE === "1") return true;
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

let queue: Promise<unknown> = Promise.resolve();

export function runLocalLighthouse(url: string, strategy: "mobile" | "desktop", timeoutMs: number): Promise<any> {
  const run = queue.then(() => runOnce(url, strategy, timeoutMs));
  queue = run.catch(() => undefined);
  return run;
}

function runOnce(url: string, strategy: "mobile" | "desktop", timeoutMs: number): Promise<any> {
  const bin = path.join(process.cwd(), "node_modules", "lighthouse", "cli", "index.js");
  const args = [
    bin,
    url,
    "--output=json",
    "--output-path=stdout",
    "--quiet",
    "--only-categories=performance,accessibility,seo,best-practices",
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
    ...(strategy === "desktop" ? ["--preset=desktop"] : []),
  ];
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(err.killed ? "local Lighthouse timed out" : `local Lighthouse failed: ${err.message.split("\n")[0]}`));
      try {
        const lhr = JSON.parse(stdout);
        if (lhr.runtimeError) return reject(new Error(lhr.runtimeError.message));
        resolve({ lighthouseResult: lhr });
      } catch {
        reject(new Error("local Lighthouse returned unreadable output"));
      }
    });
  });
}
