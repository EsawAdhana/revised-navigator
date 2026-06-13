/**
 * Lightweight in-memory fixed-window rate limiter for API routes.
 *
 * NOTE: state is per-serverless-instance, so this is a best-effort throttle to
 * blunt casual abuse and accidental floods — not a distributed guarantee. For
 * hard limits, front with Vercel Firewall or an Upstash/Redis limiter.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number) {
  // Periodically drop expired buckets so the map can't grow unbounded.
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Returns true if the caller is within the limit, false if it should be blocked.
 * `limit` requests allowed per `windowMs` window, keyed by `key`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (existing.count >= limit) return false
  existing.count++
  return true
}
