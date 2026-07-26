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

export async function isRateLimited(bucket: string): Promise<boolean> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
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
