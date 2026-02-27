import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. ' +
    'Add them to your .env.local or Vercel environment variables.'
  )
}

/**
 * Browser client — stores session in cookies so the server can read it
 * (required for auth-protected API routes like /api/feedback).
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
