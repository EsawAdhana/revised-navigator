import { supabase } from './supabase'
import { deriveKey, encryptSchedule, decryptSchedule, type ScheduleItem } from './schedule-crypto'
import { useCartStore } from './cart-store'
import { useCourseStore } from './store'

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

/** Re-attaches full Course objects from catalog. Silently drops unknown course IDs. */
function hydrateItems(scheduleItems: ScheduleItem[]) {
  const courses = useCourseStore.getState().courses
  const courseMap = new Map(courses.map(c => [c.id, c]))
  return scheduleItems.flatMap(item => {
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
}

/**
 * On sign-in: fetch server schedule, merge with local cart (local wins on conflict),
 * then push merged result to server. Hydration waits for course catalog to be ready.
 */
export async function pullAndMerge(email: string, userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_schedules')
      .select('ciphertext, iv')
      .eq('user_id', userId)
      .single()

    // PGRST116 = no rows found — not an error
    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch schedule from Supabase:', error)
      return
    }

    const localItems = toScheduleItems()

    if (!data) {
      // No server row — push local cart if non-empty
      if (localItems.length > 0) {
        await pushSchedule(email, userId)
      }
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

    if (localItems.length === 0 && serverItems.length > 0) {
      // Pull server into empty local cart
      await waitForCourses()
      const hydrated = hydrateItems(serverItems)
      if (hydrated.length > 0) {
        useCartStore.setState({ items: hydrated })
      }
      return
    }

    if (localItems.length > 0 && serverItems.length > 0) {
      // Merge: local wins on ID conflict
      const merged = [...localItems]
      for (const serverItem of serverItems) {
        if (!merged.find(l => l.id === serverItem.id)) {
          merged.push(serverItem)
        }
      }
      await waitForCourses()
      const hydrated = hydrateItems(merged)
      if (hydrated.length > 0) {
        useCartStore.setState({ items: hydrated })
      }
      await pushSchedule(email, userId)
      return
    }

    // Local has items, server has empty array — push local
    if (localItems.length > 0) {
      await pushSchedule(email, userId)
    }
  } catch (err) {
    console.error('pullAndMerge error:', err)
  }
}

/**
 * Encrypts the current cart and upserts to Supabase.
 * Errors are swallowed — local state is always the source of truth.
 */
export async function pushSchedule(email: string, userId: string): Promise<void> {
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

export function debouncedPush(email: string, userId: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
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
