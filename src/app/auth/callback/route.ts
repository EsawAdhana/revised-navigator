import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getRedirectOrigin(request: Request): string {
  const { origin } = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (isLocalEnv) return origin
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim()
    const allowedHost = new URL(process.env.NEXT_PUBLIC_SITE_URL || origin).hostname
    if (host === allowedHost) return `https://${host}`
  }
  return origin
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const origin = getRedirectOrigin(request)

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=session_failed`)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('OAuth code exchange failed:', error)
    return NextResponse.redirect(`${origin}/?auth_error=session_failed`)
  }

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return NextResponse.redirect(`${origin}${safeNext}`)
}
