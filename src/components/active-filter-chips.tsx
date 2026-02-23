'use client'

import React, { useMemo } from 'react'
import { useQueryState, parseAsArrayOf, parseAsString, parseAsBoolean, parseAsInteger } from 'nuqs'
import { X } from 'lucide-react'
import { abbreviateGer, unitsLabel } from '@/lib/utils'
import { formatMinutes } from '@/lib/schedule-utils'

export function ActiveFilterChips() {
  const [hideConflicts, setHideConflicts] = useQueryState('hideConflicts', parseAsBoolean.withDefault(false))
  const [excludedWords, setExcludedWords] = useQueryState('exclude', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedTerms, setSelectedTerms] = useQueryState('terms', parseAsArrayOf(parseAsString).withDefault(['Spring 2026']))
  const [selectedDepts, setSelectedDepts] = useQueryState('depts', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedFormats, setSelectedFormats] = useQueryState('formats', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedLevels, setSelectedLevels] = useQueryState('levels', parseAsArrayOf(parseAsString).withDefault([]))
  const [unitMin, setUnitMin] = useQueryState('unitMin', parseAsInteger.withDefault(1))
  const [unitMax, setUnitMax] = useQueryState('unitMax', parseAsInteger.withDefault(5))
  const [timeMin, setTimeMin] = useQueryState('timeMin', parseAsInteger.withDefault(420))
  const [timeMax, setTimeMax] = useQueryState('timeMax', parseAsInteger.withDefault(1320))
  const [selectedGers, setSelectedGers] = useQueryState('gers', parseAsArrayOf(parseAsString).withDefault([]))
  const [selectedSchools, setSelectedSchools] = useQueryState('schools', parseAsArrayOf(parseAsString).withDefault([]))

  const toggleFilter = (item: string, current: string[], setFn: (val: string[] | null) => void, isTerm = false) => {
    if (current.includes(item)) {
      const next = current.filter(i => i !== item)
      setFn(next.length ? next : (isTerm ? ['any'] : null))
    } else {
      const next = current.filter(i => i !== 'any')
      setFn([...next, item])
    }
  }

  const removeDept = (dept: string) => {
    const next = selectedDepts.filter(d => d !== dept)
    setSelectedDepts(next.length ? next : null)
  }

  const removeExcludedWord = (word: string) => {
    const next = excludedWords.filter(w => w !== word)
    setExcludedWords(next.length ? next : null)
  }

  const chips = useMemo(() => {
    const out: { id: string, label: string, onRemove: () => void }[] = []
    if (hideConflicts) {
      out.push({ id: 'showConflicts', label: 'Show conflicting', onRemove: () => setHideConflicts(false) })
    }
    excludedWords.forEach(word => {
      out.push({ id: `exclude-${word}`, label: `Exclude: ${word}`, onRemove: () => removeExcludedWord(word) })
    })
    selectedTerms.forEach(term => {
      if (term !== 'any') {
        out.push({ id: `term-${term}`, label: term, onRemove: () => toggleFilter(term, selectedTerms, setSelectedTerms, true) })
      }
    })
    selectedDepts.forEach(dept => {
      out.push({ id: `dept-${dept}`, label: dept, onRemove: () => removeDept(dept) })
    })
    selectedFormats.forEach(fmt => {
      out.push({ id: `fmt-${fmt}`, label: fmt, onRemove: () => toggleFilter(fmt, selectedFormats, setSelectedFormats) })
    })
    selectedLevels.forEach(lvl => {
      out.push({ id: `level-${lvl}`, label: lvl, onRemove: () => toggleFilter(lvl, selectedLevels, setSelectedLevels) })
    })
    if (unitMin > 1 || unitMax < 5) {
      const label = unitMin === unitMax
        ? (unitMax >= 5 ? `${unitMin}+ ${unitsLabel(unitMin)}` : `${unitMin} ${unitsLabel(unitMin)}`)
        : (unitMax >= 5 ? `${unitMin}–5+ ${unitsLabel(unitMin)}` : (unitMin === 1 && unitMax === 1 ? `1 ${unitsLabel(1)}` : `${unitMin}–${unitMax} ${unitsLabel(unitMin)}`))
      out.push({
        id: 'unit-range',
        label,
        onRemove: () => {
          setUnitMin(1)
          setUnitMax(5)
        }
      })
    }
    if (timeMin > 420 || timeMax < 1320) {
      const label = `${formatMinutes(timeMin)} – ${formatMinutes(timeMax)}`
      out.push({
        id: 'time-range',
        label,
        onRemove: () => {
          setTimeMin(420)
          setTimeMax(1320)
        }
      })
    }
    selectedGers.forEach(ger => {
      out.push({ id: `ger-${ger}`, label: abbreviateGer(ger), onRemove: () => toggleFilter(ger, selectedGers, setSelectedGers) })
    })
    selectedSchools.forEach(school => {
      out.push({ id: `school-${school}`, label: school, onRemove: () => toggleFilter(school, selectedSchools, setSelectedSchools) })
    })
    return out
  }, [hideConflicts, excludedWords, selectedTerms, selectedDepts, selectedFormats, selectedLevels, unitMin, unitMax, timeMin, timeMax, selectedGers, selectedSchools])

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 items-center min-w-0">
      {chips.map(({ id, label, onRemove }) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-primary/5 border border-primary/30 text-xs font-medium text-primary"
        >
          <span className="whitespace-nowrap">{label}</span>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-0.5 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={`Remove ${label}`}
          >
            <X size={12} className="text-muted-foreground hover:text-foreground" />
          </button>
        </span>
      ))}
    </div>
  )
}
