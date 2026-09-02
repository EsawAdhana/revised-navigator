/**
 * Every class level Carta publishes. Listed so CLASS_YEAR_BUCKETS can be checked
 * against it -- a level nobody claims would silently vanish from the chart, and the
 * bars would stop summing to the student count in the header.
 */
export const CARTA_CLASS_LEVELS = [
  'frosh', 'soph', 'junior', 'senior', 'ug 5yr', 'coterm',
  'masters allYr', 'phd or doctoral', 'professional', 'nonmatriculated', 'other',
] as const

/**
 * The buckets the chart draws, in academic order.
 *
 * Carta's eleven levels are too fine to read: across 4,632 courses, 5th-year UG (2.7% of
 * enrollments), non-matriculated (3.0%) and other (2.6%) are never the largest group in
 * a single course, so they share one row.
 *
 * Professional students -- MBA and JD candidates -- keep their own row instead, because
 * they are 10.2% of all enrollments and the largest group in 330 courses (84% of LAW,
 * 95% of ACCT). Folded into Other they made 437 courses read as majority-unclassified;
 * folded into Grad they were real but indistinguishable from a PhD seminar. Since a
 * bucket with no students is dropped from the chart, an ordinary undergraduate course
 * never shows this row at all.
 */
export const CLASS_YEAR_BUCKETS: { label: string, keys: string[] }[] = [
  { label: 'Frosh', keys: ['frosh'] },
  { label: 'Sophomore', keys: ['soph'] },
  { label: 'Junior', keys: ['junior'] },
  { label: 'Senior', keys: ['senior'] },
  { label: 'Grad', keys: ['coterm', 'masters allYr', 'phd or doctoral'] },
  { label: 'Professional', keys: ['professional'] },
  { label: 'Other', keys: ['ug 5yr', 'nonmatriculated', 'other'] },
]


/**
 * Summary stats for one evaluation question, computed from the same response counts the
 * bars are drawn from -- not from the per-report mean/median/std the source ships, which
 * would let the strip disagree with the chart beside it.
 *
 * The spread is the point: LINGUIST 281A's hours answers average 15.3 with a median of 6
 * because two students reported 100+. A mean on its own hides that; sd names it.
 */
export function optionStats(options: { weight: number, count: number }[]) {
  const n = options.reduce((sum, o) => sum + o.count, 0)
  if (n === 0) return null
  const mean = options.reduce((sum, o) => sum + o.weight * o.count, 0) / n
  const variance = options.reduce((sum, o) => sum + o.count * (o.weight - mean) ** 2, 0) / n
  // Weighted median: walk the counts in value order until half the responses are behind.
  const sorted = [...options].sort((a, b) => a.weight - b.weight)
  let seen = 0
  let median = sorted[sorted.length - 1].weight
  for (const o of sorted) {
    seen += o.count
    if (seen >= n / 2) { median = o.weight; break }
  }
  return { n, mean, median, sd: Math.sqrt(variance) }
}
