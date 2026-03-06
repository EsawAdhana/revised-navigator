const LANGUAGE_DESCRIPTION_PATTERNS = [
  /\blanguage\s+requirement\b/i,
  /\bforeign\s+language\b/i,
  /\bfirst[- ]year\s+language\b/i,
  /\bsatisfies\b.*\blanguage\b/i,
  /\bfulfills?\b.*\blanguage\b/i,
]

const LANGUAGE_SUBJECTS = new Set([
  'SPANLANG',
  'FRENLANG',
  'GERMANLNG',
  'JAPANLNG',
  'CHINLANG',
  'KORENLNG',
  'ITALLANG',
  'PORTLANG',
  'SLAVLANG',
  'TIBETLNG',
])

export function isLanguageCourse(description: string, subject: string): boolean {
  if (LANGUAGE_SUBJECTS.has(subject)) return true
  if (!description) return false
  return LANGUAGE_DESCRIPTION_PATTERNS.some(pattern => pattern.test(description))
}
