import { supabase } from './supabase'
import { useCartStore } from './cart-store'
import { useCourseStore } from './store'
import { cartHydrated } from './cart-hydration'
import { track } from './analytics'

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

/** Waits for the course catalog to be loaded, then resolves. Resolves after a
 * timeout regardless, so callers can't hang if `hasLoaded` never flips. */
function waitForCourses(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve) => {
    if (useCourseStore.getState().hasLoaded) {
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsub()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    const unsub = useCourseStore.subscribe((state) => {
      if (state.hasLoaded) finish()
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
  const timer = setTimeout(() => { unsub() }, 60000)
  const unsub = useCourseStore.subscribe((state) => {
    if (!state.hasEnriched) return
    clearTimeout(timer)
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

let _localHydrated = false

/**
 * Re-attaches full Course data from the catalog to the locally-persisted
 * (metadata-only) cart. Runs once on app load so a reload doesn't show
 * title-less / meeting-less cart items before the server pull resolves.
 * Reads cart state fresh after awaiting so it never clobbers a server pull.
 */
export async function hydrateLocalCart(): Promise<void> {
  if (_localHydrated) return
  _localHydrated = true
  await cartHydrated
  if (useCartStore.getState().items.length === 0) return
  await waitForCourses()
  const courseMap = new Map(useCourseStore.getState().courses.map(c => [c.id, c]))
  const items = useCartStore.getState().items
  useCartStore.setState({
    items: items.map(item => {
      const course = courseMap.get(item.id)
      if (!course) return item
      return {
        ...course,
        selectedTerm: item.selectedTerm,
        selectedSectionId: item.selectedSectionId,
        selectedUnits: item.selectedUnits,
        color: item.color,
        optionalMeetings: item.optionalMeetings,
      }
    }),
  })
  reHydrateOnEnrichment(new Set(items.map(i => i.id)))
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
 * On sign-in: fetch server schedule. If the local cart is non-empty (e.g. a
 * schedule built anonymously before logging in), merge local + server (union by
 * course id, local wins) and push the result so nothing is lost. If the local
 * cart is empty, the server wins — a true cross-device pull.
 *
 * Guards:
 *  - Only pulls once per user per module lifetime (page navigations won't
 *    re-pull and clobber local state).
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
  pullInFlight = _pullSchedule(userId).finally(() => { pullInFlight = null })
  return pullInFlight
}

/** Reset sync state (call on sign-out so the next sign-in pulls fresh). */
export function resetSyncState() {
  _lastPulledUserId = null
  lastItemCount = -1
  _localHydrated = false
  _pushSuspended = false
}

/**
 * Blocks `debouncedPush` from writing to the server. Used during sign-out so
 * clearing the local cart doesn't push an empty schedule and wipe the user's
 * saved server schedule. `resetSyncState()` lifts the suspension.
 */
export function suspendPush() {
  _pushSuspended = true
}

/** Stable signature of the full schedule (id + term + section + units + optional meetings),
 * so a mid-pull edit to an existing item — not just adds/removes — is detected. */
function cartSignature(): string {
  return useCartStore.getState().items
    .map(i => `${i.id}|${i.selectedTerm ?? ''}|${i.selectedSectionId ?? ''}|${i.selectedUnits ?? ''}|${i.color ?? ''}|${(i.optionalMeetings ?? []).join('~')}`)
    .sort()
    .join(';')
}

async function _pullSchedule(userId: string): Promise<void> {
  _pullActive = true
  let success = false
  try {
    // Flush (not cancel) any pending local changes so the server has them
    // before we read. This prevents the pull from overwriting un-pushed adds.
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
      await pushSchedule(userId)
    }

    await cartHydrated

    const snapshotSig = cartSignature()

    const { data, error } = await supabase
      .from('user_schedules')
      .select('schedule')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch schedule from Supabase:', error)
      return
    }

    // If the user changed the cart while we were fetching (add/remove OR an edit to
    // an existing item), their intent wins — push local instead of overwriting it.
    if (snapshotSig !== cartSignature()) {
      await pushSchedule(userId)
      return
    }

    const serverItems = data
      ? ((Array.isArray(data.schedule) ? data.schedule : []) as ScheduleItem[])
      : []
    const localItems = toScheduleItems()

    if (localItems.length > 0) {
      // Local cart has items (e.g. built anonymously before logging in) — merge
      // so nothing the user built is lost. Union by course id; local wins on
      // conflicts. Then push the merged result to the server.
      const localIds = new Set(localItems.map(i => i.id))
      const serverOnly = serverItems.filter(s => !localIds.has(s.id))
      if (serverOnly.length > 0) {
        await waitForCourses()
        const hydratedServerOnly = hydrateItems(serverOnly)
        if (hydratedServerOnly.length > 0) {
          useCartStore.setState((state) => ({ items: [...state.items, ...hydratedServerOnly] }))
          const syncedIds = new Set(serverOnly.map(s => s.id))
          useCourseStore.getState().fetchCourseDetails([...syncedIds])
          reHydrateOnEnrichment(syncedIds)
        }
      }
      await pushSchedule(userId)
    } else if (serverItems.length > 0) {
      // Local cart empty — server wins (true cross-device pull)
      await waitForCourses()
      const hydrated = hydrateItems(serverItems)
      if (hydrated.length > 0) {
        useCartStore.setState({ items: hydrated })
        const syncedIds = new Set(serverItems.map(s => s.id))
        useCourseStore.getState().fetchCourseDetails([...syncedIds])
        reHydrateOnEnrichment(syncedIds)
      }
    } else if (data) {
      // Server row exists but is empty, and local is empty — nothing to do.
      useCartStore.setState({ items: [] })
    }

    track('schedule_synced', { items: toScheduleItems().length })
    success = true
  } catch (err) {
    console.error('pullSchedule error:', err)
  } finally {
    _pullActive = false
    if (success) _lastPulledUserId = userId
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastItemCount = -1
let _pushSuspended = false

export function debouncedPush(userId: string) {
  if (_pullActive || _pushSuspended) return
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
