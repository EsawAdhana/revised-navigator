/** Unlocks course evaluations without Stanford login during `next dev` only.
 *  Set NEXT_PUBLIC_DEV_UNLOCK_EVALS=false in .env.local to turn off. */
export function isDevEvalsUnlocked(): boolean {
  if (process.env.NODE_ENV !== 'development') return false
  return process.env.NEXT_PUBLIC_DEV_UNLOCK_EVALS !== 'false'
}
