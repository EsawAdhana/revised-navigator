import { supabase } from './supabase'
import { useCartStore } from './cart-store'
import { useCourseStore } from './store'
import { cartHydrated } from './cart-hydration'

// Minimal payload stored server-side — no full Course catalog data
export type ScheduleItem = {
  id: string
  selectedTerm?: string
  selectedSectionId?: number
  selectedUnits?: number
  color?: string
  optionalMeetings?: string[]
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
 * Upserts current cart to Supabase as plaintext JSONB.
 * Errors are swallowed — local state remains visible to user.
 */
async function pushSchedule(userId: string): Promise<void> {
  try {
    const schedule = toScheduleItems()
    const { error } = await supabase
      .from('user_schedules')
      .upsert({ user_id: userId, schedule }, { onConflict: 'user_id' })
    if (error) {
      console.error('Failed to push schedule:', error)
    }
  } catch (err) {
    console.error('pushSchedule error:', err)
  }
}

let pullInFlight: Promise<void> | null = null
let _pullActive = false
let _lastPulledUserId: string | null = null

/**
 * On sign-in: fetch server schedule (server wins). If server has data, hydrate
 * cart from it. If server is empty but local has items, push local to server.
 *
 * Guards:
 *  - Only pulls once per user per module lifetime (page navigations that
 *    remount AuthGate won't re-pull and clobber local state).
 *  - Flushes any pending debounced push before fetching so local changes
 *    reach the server before we read from it.
 *  - Detects cart mutations made while the fetch is in-flight and preserves
 *    local state when they occur.
 *  - Sets `_pullActive` to suppress `debouncedPush` during the pull to
 *    prevent pull's own `setState` from triggering a redundant push.
 */
export async function pullSchedule(userId: string): Promise<void> {
  if (_lastPulledUserId === userId) return
  if (pullInFlight) return pullInFlight
  _lastPulledUserId = userId
  pullInFlight = _pullSchedule(userId).finally(() => { pullInFlight = null })
  return pullInFlight
}

/** Reset sync state (call on sign-out so the next sign-in pulls fresh). */
export function resetSyncState() {
  _lastPulledUserId = null
  lastItemCount = -1
}

function cartItemIds(): Set<string> {
  return new Set(useCartStore.getState().items.map(i => i.id))
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

async function _pullSchedule(userId: string): Promise<void> {
  _pullActive = true
  try {
    // Flush (not cancel) any pending local changes so the server has them
    // before we read. This prevents the pull from overwriting un-pushed adds.
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
      await pushSchedule(userId)
    }

    await cartHydrated

    const snapshotIds = cartItemIds()

    const { data, error } = await supabase
      .from('user_schedules')
      .select('schedule')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch schedule from Supabase:', error)
      return
    }

    // If the user changed the cart while we were fetching, their intent wins
    if (!setsEqual(snapshotIds, cartItemIds())) {
      await pushSchedule(userId)
      return
    }

    if (data) {
      // Server row exists — server wins (even if empty)
      const serverItems = (Array.isArray(data.schedule) ? data.schedule : []) as ScheduleItem[]
      if (serverItems.length > 0) {
        await waitForCourses()
        const hydrated = hydrateItems(serverItems)
        if (hydrated.length > 0) {
          useCartStore.setState({ items: hydrated })
          const syncedIds = new Set(serverItems.map(s => s.id))
          useCourseStore.getState().fetchCourseDetails([...syncedIds])
          reHydrateOnEnrichment(syncedIds)
        }
      } else {
        // Server has empty schedule — clear local cart to match
        useCartStore.setState({ items: [] })
      }
    } else {
      // No server row (PGRST116) — first-time user, push local if any
      const localItems = toScheduleItems()
      if (localItems.length > 0) await pushSchedule(userId)
    }
  } catch (err) {
    console.error('pullSchedule error:', err)
  } finally {
    _pullActive = false
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastItemCount = -1

export function debouncedPush(userId: string) {
  if (_pullActive) return
  if (debounceTimer) clearTimeout(debounceTimer)
  const currentCount = useCartStore.getState().items.length

  // Push immediately on removal or empty cart
  if (currentCount === 0 || (lastItemCount >= 0 && currentCount < lastItemCount)) {
    lastItemCount = currentCount
    pushSchedule(userId)
    return
  }

  lastItemCount = currentCount
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    pushSchedule(userId)
  }, 1500)
}

export function cancelDebouncedPush() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

/** Immediately push to server (flushes debounce). */
export async function flushAndPush(userId: string): Promise<void> {
  cancelDebouncedPush()
  await pushSchedule(userId)
}
