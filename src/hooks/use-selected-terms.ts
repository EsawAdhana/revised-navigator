import { useMemo } from 'react'
import { useQueryState, parseAsArrayOf, parseAsString } from 'nuqs'
import { useCourseStore } from '@/lib/store'
import { getDefaultTerm } from '@/lib/terms'

/** Distinct terms present in the loaded catalog. */
export function useAvailableTerms(): string[] {
  const courses = useCourseStore(s => s.courses)
  return useMemo(() => {
    const set = new Set<string>()
    for (const c of courses) c.terms?.forEach(t => { if (t) set.add(t) })
    return Array.from(set)
  }, [courses])
}

/**
 * Browse term selection with a catalog-aware default. When the URL has no
 * explicit `terms` param, we fall back to getDefaultTerm(availableTerms) — the
 * latest term that actually has data — instead of the bare calendar quarter,
 * which may not exist in the catalog and would otherwise show "0 classes".
 *
 * Mirrors the nuqs useQueryState tuple shape: [value, setValue].
 */
export function useSelectedTerms(): [string[], (val: string[] | null) => void] {
  const availableTerms = useAvailableTerms()
  const [raw, setRaw] = useQueryState('terms', parseAsArrayOf(parseAsString))
  const effective = useMemo(
    () => (raw && raw.length > 0 ? raw : [getDefaultTerm(availableTerms)]),
    [raw, availableTerms]
  )
  return [effective, setRaw]
}
