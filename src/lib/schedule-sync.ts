import { supabase } from './supabase'
import { deriveKey, encryptSchedule, decryptSchedule, type ScheduleItem } from './schedule-crypto'
import { useCartStore } from './cart-store'
import { useCourseStore } from './store'
import { cartHydrated } from './cart-hydration'

// Module-level key cache — avoids re-running 100k PBKDF2 iterations on every cart change
let cachedKey: CryptoKey | null = null
let cachedUserId: string | null = null

async function getKey(email: string, userId: string): Promise<CryptoKey> {
  if (cachedKey && cachedUserId === userId) return cachedKey
  cachedKey = await deriveKey(email, userId)
  cachedUserId = userId
  return cachedKey
}

export function clearKeyCache() {
  cachedKey = null
  cachedUserId = null
}

function toScheduleItems(): ScheduleItem[] {
  return useCartStore.getState().items.map(item => ({
    id: item.id,
    selectedTerm: item.selectedTerm,
    selectedSectionId: item.selectedSectionId,
    selectedUnits: item.selectedUnits,
    color: item.color,
    optionalMeetings: item.optionalMeetings,
  }))
}

/** Waits for the course catalog to be loaded, then resolves. */
function waitForCourses(): Promise<void> {
  return new Promise((resolve) => {
    if (useCourseStore.getState().hasLoaded) {
      resolve()
      return
    }
    const unsub = useCourseStore.subscribe((state) => {
      if (state.hasLoaded) {
        unsub()
        resolve()
      }
    })
  })
}

/** Re-attaches full Course objects from catalog. Drops unknown course IDs (logs in dev). */
function hydrateItems(scheduleItems: ScheduleItem[], logPrefix = '') {
  const courses = useCourseStore.getState().courses
  const courseMap = new Map(courses.map(c => [c.id, c]))
  const result = scheduleItems.flatMap(item => {
    const course = courseMap.get(item.id)
    if (!course) return []
    return [{
      ...course,
      selectedTerm: item.selectedTerm,
      selectedSectionId: item.selectedSectionId,
      selectedUnits: item.selectedUnits,
      color: item.color,
      optionalMeetings: item.optionalMeetings,
    }]
  })
  if (process.env.NODE_ENV === 'development' && result.length < scheduleItems.length) {
    const dropped = scheduleItems.filter(s => !courseMap.has(s.id)).map(s => s.id)
    console.warn(
      `${logPrefix} hydrateItems dropped ${dropped.length} course(s) not in catalog:`,
      dropped,
      '| Catalog has',
      courses.length,
      'courses'
    )
  }
  return result
}

/**
 * After hydrating cart items with Phase 1 (light) course data, subscribes to
 * re-hydrate those items when Phase 2 enrichment completes so section/time
 * data is correct. Only touches courses from the original sync — preserves
 * any items the user added after the initial sync.
 */
function reHydrateOnEnrichment(syncedIds: Set<string>) {
  if (useCourseStore.getState().hasEnriched) return
  const unsub = useCourseStore.subscribe((state) => {
    if (!state.hasEnriched) return
    unsub()
    const courseMap = new Map(state.courses.map(c => [c.id, c]))
    useCartStore.setState((cartState) => ({
      items: cartState.items.map(item => {
        if (!syncedIds.has(item.id)) return item
        const enriched = courseMap.get(item.id)
        if (!enriched) return item
        return { ...enriched, selectedTerm: item.selectedTerm, selectedSectionId: item.selectedSectionId, selectedUnits: item.selectedUnits, color: item.color, optionalMeetings: item.optionalMeetings }
      })
    }))
  })
}

/**
 * Merges local and server schedule items (local wins on ID conflict),
 * hydrates from catalog, and updates the cart store.
 * Returns true if a merge produced changes that should be pushed back.
 */
async function mergeAndHydrate(
  localItems: ScheduleItem[],
  serverItems: ScheduleItem[],
  logPrefix = ''
): Promise<boolean> {
  if (localItems.length === 0 && serverItems.length > 0) {
    await waitForCourses()
    const hydrated = hydrateItems(serverItems, logPrefix)
    if (hydrated.length > 0) {
      useCartStore.setState({ items: hydrated })
      const syncedIds = new Set(serverItems.map(s => s.id))
      // Eagerly fetch full section data in parallel with Phase 2 catalog fetch
      useCourseStore.getState().fetchCourseDetails([...syncedIds])
      reHydrateOnEnrichment(syncedIds)
    }
    return false
  }

  if (localItems.length > 0 && serverItems.length > 0) {
    const merged = [...localItems]
    for (const serverItem of serverItems) {
      if (!merged.find(l => l.id === serverItem.id)) {
        merged.push(serverItem)
      }
    }
    await waitForCourses()
    const hydrated = hydrateItems(merged, logPrefix)
    if (hydrated.length > 0) {
      useCartStore.setState({ items: hydrated })
      const syncedIds = new Set(merged.map(s => s.id))
      // Eagerly fetch full section data in parallel with Phase 2 catalog fetch
      useCourseStore.getState().fetchCourseDetails([...syncedIds])
      reHydrateOnEnrichment(syncedIds)
    }
    return true
  }

  return localItems.length > 0
}

let pullInFlight: Promise<void> | null = null

/**
 * On sign-in: fetch server schedule, merge with local cart (local wins on conflict),
 * then push merged result to server. Hydration waits for course catalog to be ready.
 * Serialized: concurrent calls await the in-flight request instead of interleaving.
 */
export async function pullAndMerge(email: string, userId: string): Promise<void> {
  if (pullInFlight) return pullInFlight
  pullInFlight = _pullAndMerge(email, userId).finally(() => { pullInFlight = null })
  return pullInFlight
}

async function _pullAndMerge(email: string, userId: string): Promise<void> {
  try {
    cancelDebouncedPush()
    await cartHydrated

    const { data, error } = await supabase
      .from('user_schedules')
      .select('ciphertext, iv')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch schedule from Supabase:', error)
      return
    }

    const localItems = toScheduleItems()

    if (!data) {
      if (localItems.length > 0) await pushSchedule(email, userId)
      return
    }

    let serverItems: ScheduleItem[]
    try {
      const key = await getKey(email, userId)
      serverItems = await decryptSchedule(data.ciphertext, data.iv, key)
    } catch (err) {
      console.error('Failed to decrypt schedule — leaving local cart intact:', err)
      return
    }

    const shouldPush = await mergeAndHydrate(localItems, serverItems)
    if (shouldPush) await pushSchedule(email, userId)
  } catch (err) {
    console.error('pullAndMerge error:', err)
  }
}

/**
 * Encrypts the current cart and upserts to Supabase.
 * Errors are swallowed — local state is always the source of truth.
 */
async function pushSchedule(email: string, userId: string): Promise<void> {
  try {
    const items = toScheduleItems()
    const key = await getKey(email, userId)
    const { ciphertext, iv } = await encryptSchedule(items, key)
    const { error } = await supabase
      .from('user_schedules')
      .upsert({ user_id: userId, ciphertext, iv }, { onConflict: 'user_id' })
    if (error) {
      console.error('Failed to push schedule:', error)
    }
  } catch (err) {
    console.error('pushSchedule error:', err)
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastItemCount = -1

export function debouncedPush(email: string, userId: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  const currentCount = useCartStore.getState().items.length

  // Push immediately on removal or empty cart
  if (currentCount === 0 || (lastItemCount >= 0 && currentCount < lastItemCount)) {
    lastItemCount = currentCount
    pushSchedule(email, userId)
    return
  }

  lastItemCount = currentCount
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    pushSchedule(email, userId)
  }, 1500)
}

export function cancelDebouncedPush() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

/** Immediately push to server (flushes debounce). */
export async function flushAndPush(email: string, userId: string): Promise<void> {
  cancelDebouncedPush()
  await pushSchedule(email, userId)
}
