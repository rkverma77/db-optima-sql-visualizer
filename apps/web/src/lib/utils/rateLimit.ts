import type { NextRequest } from "next/server";

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * IMPORTANT LIMITATION: this state lives in the Node.js process memory.
 * It works correctly for a single long-running server (e.g. `next start`
 * on one machine, or local dev). On serverless platforms with multiple
 * concurrent instances (e.g. Vercel functions), each instance gets its
 * own counter, so the *effective* limit is `limit * (number of warm
 * instances)`, not a hard global cap. That's an acceptable stopgap to
 * stop naive scripted abuse, but if you need a real guarantee in a
 * multi-instance deployment, swap this for a shared store such as
 * Upstash Redis (`@upstash/ratelimit`) — the call sites below only need
 * `checkRateLimit()`'s return shape to stay the same.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Periodically drop stale buckets so this Map doesn't grow forever
// on a long-lived server process.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupIfDue(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfterSeconds: number;
}

/**
 * Checks and increments the request count for `key` within a fixed window.
 *
 * @param key         Identifier to rate-limit on (typically client IP + route name)
 * @param limit       Max requests allowed per window
 * @param windowMs    Window size in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  cleanupIfDue(windowMs);

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, limit, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000);

  return { ok: existing.count <= limit, limit, remaining, retryAfterSeconds };
}

/**
 * Best-effort client IP extraction behind a proxy (Vercel sets x-forwarded-for).
 * Falls back to a constant so local dev / missing headers still get *a* bucket
 * rather than throwing.
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
