import { useMemo } from 'react'
import { useQueryState, parseAsArrayOf, parseAsString, parseAsInteger } from 'nuqs'
import { useSelectedTerms } from '@/hooks/use-selected-terms'
import { buildFilterChips, type FilterChip } from '@/lib/active-filters'

/**
 * The active browse filters, as removable chips. Shared by the chip row and the
 * mobile menu badge so both read the same list.
 */
export function useActiveFilterChips(): FilterChip[] {
  const [query, setQuery] = useQueryState('q', { defaultValue: '' })
  const [excludedWords, setExcludedWords] = useQueryState('exclude', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedTerms, setSelectedTerms] = useSelectedTerms()
  const [selectedDepts, setSelectedDepts] = useQueryState('depts', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedFormats, setSelectedFormats] = useQueryState('formats', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedLevels, setSelectedLevels] = useQueryState('levels', parseAsArrayOf(parseAsString).withDefault([]))
  const [unitMin, setUnitMin] = useQueryState('unitMin', parseAsInteger.withDefault(1))
  const [unitMax, setUnitMax] = useQueryState('unitMax', parseAsInteger.withDefault(5))
  const [timeMin, setTimeMin] = useQueryState('timeMin', parseAsInteger.withDefault(420))
  const [timeMax, setTimeMax] = useQueryState('timeMax', parseAsInteger.withDefault(1320))
  const [selectedGers, setSelectedGers] = useQueryState('gers', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedSchools, setSelectedSchools] = useQueryState('schools', parseAsArrayOf(parseAsString).withDefault([]))

  return useMemo(
    () => buildFilterChips(
      {
        query, excludedWords, selectedTerms, selectedDepts, selectedFormats, selectedLevels,
        unitMin, unitMax, timeMin, timeMax, selectedGers, selectedSchools,
      },
      {
        setQuery, setExcludedWords, setSelectedTerms, setSelectedDepts, setSelectedFormats,
        setSelectedLevels, setUnitMin, setUnitMax, setTimeMin, setTimeMax, setSelectedGers,
        setSelectedSchools,
      }
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, excludedWords, selectedTerms, selectedDepts, selectedFormats, selectedLevels, unitMin, unitMax, timeMin, timeMax, selectedGers, selectedSchools]
  )
}
