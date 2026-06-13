import type { AnalyticsEvent } from './analytics-events'

const SESSION_KEY = 'root_session_id'

/** Stable anonymous device/session id, independent of auth. Lets us distinguish
 *  devices and attribute pre-login activity. */
function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

/**
 * Records a first-party analytics event. Client-only, fire-and-forget, and never
 * throws — analytics must not break the app. `user_id` is attached server-side
 * from the auth cookie, so it is not sent here.
 */
export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  try {
    const body = JSON.stringify({
      event,
      props,
      session_id: getSessionId(),
      path: window.location.pathname,
    })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* ignore */ })
    }
  } catch {
    // Never let analytics break the app
  }
}
