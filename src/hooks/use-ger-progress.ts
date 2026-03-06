import { useMemo } from 'react'
import { useCartStore } from '@/lib/cart-store'
import { useCourseStore } from '@/lib/store'
import { GER_REQUIREMENTS, type GerRequirement } from '@/lib/ger-requirements'
import type { Section } from '@/types/course'

export type GerProgress = {
  requirement: GerRequirement
  fulfilled: number
  contributingCourses: string[] // e.g. ['CS 106A', 'MATH 51']
}

function matchesTags(gerTags: string[], matchTags: string[]): boolean {
  const normalized = gerTags.map(g => g.toLowerCase())
  return matchTags.some(tag => normalized.some(g => g.includes(tag.toLowerCase())))
}

function parseUnits(units: number | string): number {
  if (typeof units === 'number') return units
  // Handle ranges like "3-4" — take the minimum
  const match = String(units).match(/(\d+(?:\.\d+)?)/)
  return match ? parseFloat(match[1]) : 0
}

export function useGerProgress(): {
  items: GerProgress[]
  totalRequired: number
  totalFulfilled: number
} {
  const cartItems = useCartStore(state => state.items)
  const courses = useCourseStore(state => state.courses)

  return useMemo(() => {
    // Build a map for fast course lookup
    const courseMap = new Map(courses.map(c => [c.id, c]))

    // For each cart item, find the selected section
    type ResolvedItem = { courseCode: string; section: Section }
    const resolved: ResolvedItem[] = []

    for (const item of cartItems) {
      const fullCourse = courseMap.get(item.id)
      const sections = fullCourse?.sections ?? item.sections ?? []
      const selectedTerm = item.selectedTerm

      let section: Section | undefined

      if (item.selectedSectionId != null) {
        section = sections.find(s => s.classId === item.selectedSectionId)
      }

      if (!section && selectedTerm) {
        section = sections.find(s => s.term === selectedTerm)
      }

      if (!section && sections.length > 0) {
        section = sections[0]
      }

      if (section) {
        resolved.push({
          courseCode: `${item.subject} ${item.code}`,
          section,
        })
      }
    }

    // Compute progress for each requirement
    const items: GerProgress[] = GER_REQUIREMENTS.map(req => {
      const contributingCourses: string[] = []
      let fulfilled = 0

      for (const { courseCode, section } of resolved) {
        const gerTags = section.gers ?? []
        if (!matchesTags(gerTags, req.matchTags)) continue

        if (req.type === 'units') {
          fulfilled += parseUnits(section.units)
        } else {
          fulfilled += 1
        }
        contributingCourses.push(courseCode)
      }

      // Cap at required
      fulfilled = Math.min(fulfilled, req.required)

      return { requirement: req, fulfilled, contributingCourses }
    })

    const totalRequired = GER_REQUIREMENTS.length
    const totalFulfilled = items.filter(i => i.fulfilled >= i.requirement.required).length

    return { items, totalRequired, totalFulfilled }
  }, [cartItems, courses])
}
