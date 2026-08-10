import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const url = request.nextUrl

  // Supabase sometimes redirects to Site URL root (?code=...) instead of
  // /auth/callback when the requested redirect URL isn't whitelisted.
  if (url.pathname !== '/auth/callback' && url.searchParams.has('code')) {
    const code = url.searchParams.get('code')!
    const callbackUrl = new URL('/auth/callback', url.origin)
    callbackUrl.searchParams.set('code', code)

    const nextParams = new URLSearchParams(url.searchParams)
    nextParams.delete('code')
    const nextPath =
      url.pathname + (nextParams.toString() ? `?${nextParams.toString()}` : '')
    callbackUrl.searchParams.set('next', nextPath || '/')

    return NextResponse.redirect(callbackUrl)
  }

  // Only the landing page needs to know who the user is. getUser() is a network
  // round trip to Supabase, and running it on every matched path billed one per
  // navigation *and* per Next.js link prefetch (~1.5k/hour at near-zero
  // traffic). Route handlers that need auth verify it themselves, and the
  // browser client refreshes its own tokens.
  if (url.pathname !== '/') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  // Signed-in users skip the marketing landing page and go straight to the app.
  if (
    user?.email?.endsWith('@stanford.edu') &&
    !url.searchParams.has('auth_error')
  ) {
    // Preserve any refreshed-session cookies getUser() set on supabaseResponse,
    // otherwise the redirect drops them and the session can silently expire.
    const redirect = NextResponse.redirect(new URL('/browse', url.origin))
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie)
    })
    return redirect
  }

  return supabaseResponse
}

export const config = {
  // Stays broad so a `?code=` landing on any path still reaches the callback
  // fallback above; everything other than `/` returns without touching Supabase.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
