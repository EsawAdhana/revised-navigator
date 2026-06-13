// Returns the authenticated Supabase user ID.
// Falls back to an anonymous localStorage UUID if no auth session exists.

import { useAuthStore } from './auth-store'

let cachedAnonId: string | null = null

export function getUserId (): string {
  // Prefer authenticated user ID
  const user = useAuthStore.getState().user
  if (user) return user.id

  // Anonymous users (not signed in) get a stable localStorage UUID
  if (typeof window === 'undefined') return 'server'

  if (cachedAnonId) return cachedAnonId
  const key = 'root_user_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  cachedAnonId = id
  return id
}
