/**
 * Tracks when the cart store's persist middleware has finished rehydrating from localStorage.
 * Used by schedule-sync to avoid reading stale/empty cart state before hydration completes,
 * which would cause the wrong data to be merged or overwritten by a later rehydration.
 */
let resolveHydration: (() => void) | null = null
const hydrationPromise = new Promise<void>((r) => {
  resolveHydration = r
})

/** Wait for cart hydration, with 3s timeout to avoid hanging if persist never fires */
export const cartHydrated: Promise<void> = Promise.race([
  hydrationPromise,
  new Promise<void>((r) => setTimeout(() => {
    console.warn('[cart-hydration] Timed out waiting for persist rehydration — proceeding with current cart state')
    r()
  }, 3000))
])

export function setCartHydrated(): void {
  if (resolveHydration) {
    resolveHydration()
    resolveHydration = null
  }
}
