import type { H3Event } from 'h3'

// In-memory fixed-window limiter (SPEC §11). Fine for the single-instance deployment.
const windows = new Map<string, { count: number; resetAt: number }>()

const windowId = (event: H3Event, key: string) =>
  `${key}:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`

/** Forget attempts for this client, e.g. after a successful login so only failures count. */
export function resetRateLimit(event: H3Event, key: string): void {
  windows.delete(windowId(event, key))
}

export function rateLimit(event: H3Event, opts: { key: string; limit: number; windowMs: number }): void {
  const id = windowId(event, opts.key)
  const now = Date.now()

  let entry = windows.get(id)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + opts.windowMs }
    windows.set(id, entry)
  }
  entry.count++

  if (entry.count > opts.limit) {
    setResponseHeader(event, 'Retry-After', Math.ceil((entry.resetAt - now) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Too many requests', data: { code: 'rate_limited' } })
  }

  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k)
  }
}
