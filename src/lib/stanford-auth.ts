import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Verifies the request carries a valid Stanford session. Evaluation data is
 *  Stanford-community-only, so anonymous requests are rejected. */
export async function getStanfordUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
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
  if (!user || !user.email?.endsWith('@stanford.edu')) return null
  return user
}
