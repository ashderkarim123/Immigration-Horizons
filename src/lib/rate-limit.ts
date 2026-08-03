import { headers } from "next/headers";

// In-memory, per-instance rate limiter for the two public form actions.
// Fine for a single-process deployment (see deployment guide); if this app
// is ever scaled to multiple instances behind a load balancer without
// sticky sessions, move this to a shared store (Redis) since each instance
// would otherwise track its own independent counts.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

function pruneOld() {
  if (hits.size < 500) return;
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, timestamps] of hits) {
    const kept = timestamps.filter((t) => t > cutoff);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
  }
}

function extractIp(h: { get(name: string): string | null }): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * `request` is optional and exists for callers outside a Next.js
 * request-handling context (e.g. Route Handlers invoked directly by
 * integration tests, which never populate `next/headers`'s request-scoped
 * storage) — pass the handler's own `Request` there. Server Actions keep
 * calling this with no `request` argument and fall back to `next/headers`.
 */
export async function isRateLimited(
  bucket: string,
  request?: Request,
): Promise<boolean> {
  const ip = request ? extractIp(request.headers) : extractIp(await headers());
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  pruneOld();

  const existing = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (existing.length >= MAX_PER_WINDOW) {
    hits.set(key, existing);
    return true;
  }
  existing.push(now);
  hits.set(key, existing);
  return false;
}
