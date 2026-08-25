/**
 * The catalog fetch had no timeout and no retry: any hiccup left the browse list
 * on "Couldn't load courses", and the Retry button re-issued the identical
 * request. Phase 1 is 394KB brotli, phase 2 about 3.3MB, so a slow phone is the
 * realistic failure and one retry usually clears it.
 */
const CATALOG_TIMEOUT_MS = 20000
const CATALOG_RETRY_DELAY_MS = 800

export async function fetchCatalogJson(url: string, attempts = 2): Promise<any[]> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err
      if (attempt < attempts) {
        await new Promise(r => setTimeout(r, CATALOG_RETRY_DELAY_MS * attempt))
      }
    }
  }
  throw lastError
}
