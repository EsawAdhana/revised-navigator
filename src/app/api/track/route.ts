import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ALLOWED_EVENTS } from '@/lib/analytics-events'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const MAX_PROPS_BYTES = 2000
const MAX_PATH_LENGTH = 512
const MAX_PROP_KEYS = 20
const MAX_PROP_STRING_LENGTH = 256

/** Keep only primitive prop values (string/number/boolean) to limit PII and
 *  JSON bloat from arbitrary nested payloads. */
function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let keys = 0
  for (const [k, v] of Object.entries(props)) {
    if (keys >= MAX_PROP_KEYS) break
    if (typeof v === 'string') {
      out[k] = v.slice(0, MAX_PROP_STRING_LENGTH)
      keys++
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
      keys++
    }
  }
  return out
}

/** POST /api/track — records a first-party analytics event. Anonymous requests
 *  are allowed; user_id is derived server-side from the auth cookie (never trusted
 *  from the client). Always returns quickly and never leaks errors. */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) {
    // Analytics is best-effort — never error the client.
    return new NextResponse(null, { status: 204 })
  }

  // Best-effort per-IP throttle to blunt write spam. Stays silent (204) so the
  // client experience is never affected.
  if (!rateLimit(`track:${getClientIp(request)}`, 120, 60 * 1000)) {
    return new NextResponse(null, { status: 204 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const { event, props, session_id, path } = (body ?? {}) as {
    event?: unknown
    props?: unknown
    session_id?: unknown
    path?: unknown
  }

  if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
    return new NextResponse(null, { status: 204 })
  }

  let safeProps: Record<string, unknown> = {}
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    try {
      if (JSON.stringify(props).length <= MAX_PROPS_BYTES) {
        safeProps = sanitizeProps(props as Record<string, unknown>)
      }
    } catch {
      safeProps = {}
    }
  }

  const sessionId = typeof session_id === 'string' ? session_id.slice(0, 64) : null
  const pagePath = typeof path === 'string' ? path.slice(0, MAX_PATH_LENGTH) : null

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored when called from a Route Handler
          }
        }
      }
    })

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('analytics_events').insert({
      event,
      props: safeProps,
      session_id: sessionId,
      user_id: user?.id ?? null,
      path: pagePath,
    })
  } catch {
    // Swallow — analytics must never affect the user experience.
  }

  return new NextResponse(null, { status: 204 })
}
