/** Runs fn once; later calls share the same promise. */
export function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= fn());
}

/** Promise.all with a concurrency cap; preserves input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export class TimeoutError extends Error {}

export function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function list(items: string[], max = 8): string {
  const shown = items.slice(0, max).map((s) => `• ${s}`);
  if (items.length > max) shown.push(`…and ${items.length - max} more`);
  return shown.join("\n");
}
