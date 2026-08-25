'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useEvaluationStore } from '@/lib/evaluation-store'
import { useAuthStore } from '@/lib/auth-store'
import { track } from '@/lib/analytics'
import { StanfordLoginButton } from '@/components/stanford-login-button'
import {
  Loader2, ChevronDown, ChevronUp, MessageSquare,
  ExternalLink, Clock, Search, X, Lock
} from 'lucide-react'
import { cn, decodeHtmlEntities } from '@/lib/utils'
import { formatInstructorName, instructorSlug } from '@/lib/instructors'
import { isDevEvalsUnlocked } from '@/lib/dev-flags'
import { compareTerms } from '@/lib/terms'
import type { CourseEvaluation, EvalQuestion, EvalOption } from '@/types/course'

// --- Color helpers (green=good, yellow/orange=mid, red=bad) ---

function scoreColor(score: number): string {
  if (score >= 4.5) return 'text-emerald-600'
  if (score >= 4.0) return 'text-green-600'
  if (score >= 3.5) return 'text-yellow-600'
  if (score >= 3.0) return 'text-orange-600'
  return 'text-red-600'
}

function scoreBg(score: number): string {
  if (score >= 4.5) return 'bg-emerald-500/12 border-emerald-500/25'
  if (score >= 4.0) return 'bg-green-500/12 border-green-500/25'
  if (score >= 3.5) return 'bg-yellow-500/12 border-yellow-500/25'
  if (score >= 3.0) return 'bg-orange-500/12 border-orange-500/25'
  return 'bg-red-500/12 border-red-500/25'
}

export function barFill(score: number): string {
  if (score >= 4.5) return 'bg-emerald-500'
  if (score >= 4.0) return 'bg-green-500'
  if (score >= 3.5) return 'bg-yellow-500'
  if (score >= 3.0) return 'bg-orange-500'
  return 'bg-red-500'
}

// --- Question categorization ---

export type QuestionCategory = 'quality' | 'learning' | 'organization' | 'goals' | 'hours' | 'attendance_in_person' | 'attendance_online' | 'unknown'

export function categorizeQuestion(text: string): QuestionCategory {
  const t = (text || '').toLowerCase()
  if (t.includes('quality') || t.includes('overall')) return 'quality'
  if (t.includes('how much did you learn')) return 'learning'
  if (t.includes('organized')) return 'organization'
  if (t.includes('learning goals')) return 'goals'
  // Hours: "hours per week", "how many hours...week", or "hours" + "week" (Stanford: "How many hours per week on average did you spend...")
  if (t.includes('hours per week') || (t.includes('hours') && t.includes('week'))) return 'hours'
  if (t.includes('percent') && t.includes('in person')) return 'attendance_in_person'
  if (t.includes('percent') && t.includes('online')) return 'attendance_online'
  return 'unknown'
}

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  quality: 'Instruction Quality',
  learning: 'Learning',
  organization: 'Organization',
  goals: 'Goals Achieved',
  hours: 'Hours / Week',
  attendance_in_person: 'In-Person Attendance',
  attendance_online: 'Online Attendance',
  unknown: 'Other'
}

/** The categories surfaced in summaries, in display order. */
export const RATING_CATEGORIES: QuestionCategory[] = ['quality', 'learning', 'organization', 'hours']

const CATEGORY_SHORT: Record<QuestionCategory, string> = {
  quality: 'Quality',
  learning: 'Learn',
  organization: 'Org',
  goals: 'Goals',
  hours: 'Hrs/Wk',
  attendance_in_person: 'In-Person',
  attendance_online: 'Online',
  unknown: ''
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// --- Aggregation (all medians, never mean) ---

export function aggregateMetrics(evals: CourseEvaluation[]) {
  try {
    if (!Array.isArray(evals)) return {}
    const byCat: Record<QuestionCategory, number[]> = {
      quality: [], learning: [], organization: [], goals: [], hours: [],
      attendance_in_person: [], attendance_online: [], unknown: []
    }

    for (const ev of evals) {
      const questions = ev?.questions || []
      for (const q of questions) {
        const cat = categorizeQuestion(q?.text ?? '')
        const val = typeof q?.median === 'number' && !isNaN(q.median) ? q.median : null
        if (val != null) byCat[cat].push(val)
      }
    }

    const result: Partial<Record<QuestionCategory, number>> = {}
    for (const [cat, values] of Object.entries(byCat)) {
      const m = median(values)
      if (m != null) result[cat as QuestionCategory] = m
    }
    return result
  } catch {
    return {}
  }
}

function computeInstructorStats(evals: CourseEvaluation[]) {
  const byInstructor: Record<string, { scores: Record<QuestionCategory, number[]>, evalCount: number, terms: Set<string> }> = {}

  for (const ev of evals) {
    const name = ev.instructor
    if (!byInstructor[name]) {
      byInstructor[name] = {
        scores: {
          quality: [], learning: [], organization: [], goals: [], hours: [],
          attendance_in_person: [], attendance_online: [], unknown: []
        },
        evalCount: 0,
        terms: new Set()
      }
    }
    byInstructor[name].evalCount++
    byInstructor[name].terms.add(ev.term)
    for (const q of ev.questions) {
      const cat = categorizeQuestion(q.text)
      byInstructor[name].scores[cat].push(q.median)
    }
  }

  return Object.entries(byInstructor).map(([name, data]) => {
    const scores: Partial<Record<QuestionCategory, number>> = {}
    for (const [cat, values] of Object.entries(data.scores)) {
      const m = median(values)
      if (m != null) scores[cat as QuestionCategory] = m
    }
    return { name, scores, evalCount: data.evalCount, terms: Array.from(data.terms) }
  }).sort((a, b) => (b.scores.quality || 0) - (a.scores.quality || 0))
}

// --- Sub-components ---

export function ScoreBadge({ score, size = 'md' }: { score: number, size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 min-w-[36px]',
    md: 'text-sm px-2 py-0.5 min-w-[44px]',
    lg: 'text-lg px-3 py-1 min-w-[52px] font-bold'
  }

  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-md border font-semibold tabular-nums',
      scoreBg(score),
      scoreColor(score),
      sizeClasses[size]
    )}>
      {score.toFixed(size === 'sm' ? 1 : 2)}
    </span>
  )
}

// Horizontal histogram for hours data
function HoursHistogram({ options }: { options: EvalOption[] }) {
  const buckets = useMemo(() => {
    const ranges = [
      { label: '0-5', min: 0, max: 5 },
      { label: '5-10', min: 5, max: 10 },
      { label: '10-15', min: 10, max: 15 },
      { label: '15-20', min: 15, max: 20 },
      { label: '20-25', min: 20, max: 25 },
      { label: '25-30', min: 25, max: 30 },
      { label: '30+', min: 30, max: Infinity }
    ]

    const result = ranges.map(r => ({ ...r, count: 0 }))
    for (const opt of options) {
      const val = opt.weight
      const bucket = result.find(r => val >= r.min && val < r.max)
      if (bucket) bucket.count += opt.count
    }
    return result
  }, [options])

  const maxCount = Math.max(...buckets.map(b => b.count), 1)
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)

  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-1 h-20">
        {buckets.map((bucket, i) => {
          const height = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0
          const pct = totalCount > 0 ? ((bucket.count / totalCount) * 100).toFixed(0) : '0'
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end group relative">
              {bucket.count > 0 && (
                <span className="text-[9px] text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                  {bucket.count} ({pct}%)
                </span>
              )}
              <div
                className="w-full rounded-t bg-primary transition-all duration-300 hover:brightness-110"
                style={{
                  height: `${Math.max(height, bucket.count > 0 ? 4 : 0)}%`,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1">
        {buckets.map((bucket, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground tabular-nums">
            {bucket.label}
          </div>
        ))}
      </div>
      <div className="text-center text-[9px] text-muted-foreground/60">hours per week</div>
    </div>
  )
}

// --- Instructor row that expands on click ---

function InstructorRow({ instructor, ratingCats, isExpanded, onToggle, evals }: {
  instructor: { name: string, scores: Partial<Record<QuestionCategory, number>>, evalCount: number, terms: string[] }
  ratingCats: QuestionCategory[]
  isExpanded: boolean
  onToggle: () => void
  evals: CourseEvaluation[]
}) {
  const instructorEvals = useMemo(
    () => evals.filter(e => e.instructor === instructor.name),
    [evals, instructor.name]
  )

  return (
    <div className="border-b border-border/30 last:border-0">
      {/* Not a <button>: the name inside is a link, and anchors can't nest in buttons. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
        className={cn(
          'w-full grid gap-2 px-4 py-2.5 items-center hover:bg-secondary/20 transition-colors cursor-pointer',
          isExpanded && 'bg-secondary/10'
        )}
        style={{ gridTemplateColumns: '1fr repeat(4, minmax(40px, 52px))' }}
      >
        <div className="min-w-0 text-left">
          <Link
            href={`/instructors/${instructorSlug(instructor.name)}`}
            onClick={e => e.stopPropagation()}
            className="text-sm font-medium text-foreground truncate block hover:underline underline-offset-2"
          >
            {formatInstructorName(instructor.name)}
          </Link>
          <div className="text-[10px] text-muted-foreground">
            {instructor.evalCount} {instructor.evalCount === 1 ? 'eval' : 'evals'} &middot; {instructor.terms.slice(-2).join(', ')}
          </div>
        </div>
        {ratingCats.map(cat => (
          <div key={cat} className="flex justify-center">
            {cat === 'hours' ? (
              instructor.scores.hours !== undefined ? (
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  {instructor.scores.hours.toFixed(0)}h
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">--</span>
              )
            ) : (
              instructor.scores[cat] !== undefined ? (
                <ScoreBadge score={instructor.scores[cat]!} size="sm" />
              ) : (
                <span className="text-xs text-muted-foreground">--</span>
              )
            )}
          </div>
        ))}
      </div>

      {isExpanded && (
        <div className="px-4 pb-3 pt-1 space-y-2 bg-secondary/5">
          {instructorEvals.map((ev, i) => (
            <InlineEval key={i} evaluation={ev} disableComments />
          ))}
        </div>
      )}
    </div>
  )
}

// Compact inline eval card
function InlineEval({ evaluation, disableComments }: { evaluation: CourseEvaluation, disableComments?: boolean }) {
  const [showComments, setShowComments] = useState(false)
  const ratingQuestions = evaluation.questions.filter(q => q.type === 'rating')
  const hoursQ = evaluation.questions.find(q => categorizeQuestion(q.text) === 'hours')

  return (
    <div className="border border-border/40 rounded-lg bg-card/60 overflow-hidden">
      <div className="grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: 'auto 1fr auto auto auto' }}>
        <span className="text-xs font-medium text-foreground w-24 shrink-0">{evaluation.term}</span>
        <span className="text-[10px] text-muted-foreground truncate">{evaluation.respondents}</span>
        <div className="flex items-center gap-1">
          {ratingQuestions.slice(0, 4).map((q, i) => (
            <ScoreBadge key={i} score={q.median} size="sm" />
          ))}
        </div>
        {hoursQ && typeof hoursQ.median === 'number' ? (
          <span className="text-[10px] font-semibold text-foreground tabular-nums w-14 text-right">
            {hoursQ.median.toFixed(0)} hrs/wk
          </span>
        ) : (
          <span className="w-14" />
        )}
        {evaluation.comments.length > 0 ? (
          disableComments ? (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 text-muted-foreground w-12 justify-end">
              <MessageSquare size={10} />
              {evaluation.comments.length}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowComments(!showComments) }}
              className={cn(
                'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors w-12 justify-end',
                showComments
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
              )}
            >
              <MessageSquare size={10} />
              {evaluation.comments.length}
            </button>
          )
        ) : (
          <span className="w-12" />
        )}
      </div>

      {!disableComments && showComments && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5 max-h-40 overflow-y-auto">
          {evaluation.comments.map((c, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">
              &ldquo;{decodeHtmlEntities(c)}&rdquo;
            </p>
          ))}
        </div>
      )}
    </div>
  )
}


// --- Comments panel ---

export interface CommentEntry {
  text: string
  /** Where the comment came from, e.g. "CS 106A". Shown when one list mixes courses. */
  label?: string
}

export function CommentsPanel({ comments }: { comments: CommentEntry[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(10)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return comments

    const q = searchQuery.toLowerCase()
    return comments.filter(c =>
      decodeHtmlEntities(c.text).toLowerCase().includes(q) ||
      c.label?.toLowerCase().includes(q))
  }, [comments, searchQuery])

  if (comments.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        No comments available.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">Search Keywords</div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setVisibleCount(10) }}
            placeholder="Search comments..."
            className="w-full bg-secondary/30 border border-border/40 rounded-lg pl-8 pr-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        {searchQuery ? `${filtered.length} of ${comments.length} comments` : `${comments.length} comments`}
      </div>

      <div className="space-y-2 pr-1">
        {(() => {
          const remaining = filtered.length - visibleCount
          const showAll = remaining <= 9 && remaining > 0
          const displayCount = showAll ? filtered.length : visibleCount
          return filtered.slice(0, displayCount).map((comment, i) => (
            <div
              key={i}
              // No hover highlight: the card is not clickable, and the highlight
              // read as an affordance. Students clicked the same comment
              // repeatedly waiting for it to do something — one session logged
              // 107 clicks in 29.3s on a single ECON 11N comment.
              className="text-sm text-muted-foreground bg-secondary/15 rounded-lg px-4 py-3 border border-border/20 leading-relaxed"
            >
              {comment.label && (
                <div className="text-[11px] font-bold text-destructive mb-1">{comment.label}</div>
              )}
              &ldquo;{decodeHtmlEntities(comment.text)}&rdquo;
            </div>
          ))
        })()}
      </div>

      {(() => {
        const remaining = filtered.length - visibleCount
        if (remaining <= 0) return null
        if (remaining <= 9) return null
        return (
          <button
            type="button"
            onClick={() => setVisibleCount(prev => prev + 20)}
            className="w-full text-center text-xs text-primary hover:underline font-medium py-2 mt-4"
          >
            Show more ({remaining} remaining)
          </button>
        )
      })()}
    </div>
  )
}

// Aggregated rating breakdown across multiple questions of the same category
function AggregatedRatingBreakdown({ questions, aggregateScore }: { questions: EvalQuestion[], aggregateScore: number }) {
  const mergedOptions = useMemo(() => {
    const map: Record<string, { text: string, weight: number, count: number }> = {}
    for (const q of questions) {
      for (const opt of q.options) {
        if (!map[opt.text]) {
          map[opt.text] = { text: opt.text, weight: opt.weight, count: 0 }
        }
        map[opt.text].count += opt.count
      }
    }
    return Object.values(map).sort((a, b) => b.weight - a.weight)
  }, [questions])

  const totalCount = useMemo(() => mergedOptions.reduce((sum, o) => sum + o.count, 0), [mergedOptions])
  const maxCount = useMemo(() => Math.max(...mergedOptions.map(o => o.count), 1), [mergedOptions])

  const cat = categorizeQuestion(questions[0].text)
  const label = cat !== 'unknown' ? CATEGORY_LABELS[cat] : questions[0].text

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {mergedOptions.map((opt, i) => {
          const pct = totalCount > 0 ? (opt.count / totalCount) * 100 : 0
          const barWidth = maxCount > 0 ? (opt.count / maxCount) * 100 : 0
          return (
            <div key={i} className="flex items-center gap-2 text-sm group">
              <span className="w-24 text-right text-muted-foreground shrink-0 text-[11px] leading-tight">{decodeHtmlEntities(opt.text)}</span>
              <div className="flex-1 h-4 bg-secondary/40 rounded overflow-hidden relative">
                <div
                  className={cn('h-full rounded transition-all duration-500', barFill(aggregateScore))}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="w-14 text-right text-[11px] text-muted-foreground shrink-0 tabular-nums">
                {opt.count} <span className="text-muted-foreground/50">({pct.toFixed(0)}%)</span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>{totalCount} total responses across {questions.length} evals</span>
      </div>
    </div>
  )
}

/** Median score per category with an expandable response breakdown for each. */
export function EvaluationOverview({ evaluations }: { evaluations: CourseEvaluation[] }) {
  const metrics = useMemo(() => aggregateMetrics(evaluations), [evaluations])

  const questionsByCategory = useMemo(() => {
    const map: Record<QuestionCategory, EvalQuestion[]> = {
      quality: [], learning: [], organization: [], goals: [],
      hours: [], attendance_in_person: [], attendance_online: [], unknown: []
    }
    for (const ev of evaluations) {
      for (const q of ev.questions) {
        map[categorizeQuestion(q.text)].push(q)
      }
    }
    return map
  }, [evaluations])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {RATING_CATEGORIES.map(cat => {
        if (metrics[cat] === undefined) return null
        const questions = questionsByCategory[cat]

        if (cat === 'hours') {
          return (
            <div key={cat}>
              <div className="w-full flex items-center gap-3 px-4 py-3 bg-secondary/5 rounded-t-lg border-b border-border/30">
                <Clock size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground font-medium flex-1 text-left">
                  Hours / Week
                </span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {metrics.hours!.toFixed(1)} hrs/wk
                </span>
              </div>

              <div className="px-5 pb-4 pt-4 bg-secondary/5 border border-border/20 rounded-b-lg">
                <HoursHistogram options={questions.flatMap(q => q.options)} />
                {questions[0] && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border/30">
                    <span>{questions[0].responseRate}</span>
                    <span className="tabular-nums">med {metrics.hours!.toFixed(1)} hrs/wk</span>
                  </div>
                )}
              </div>
            </div>
          )
        }

        return (
          <div key={cat}>
            <div className="w-full flex items-center gap-3 px-4 py-3 bg-secondary/5 rounded-t-lg border-b border-border/30">
              <span className="text-sm text-foreground font-medium flex-1 text-left">
                {CATEGORY_LABELS[cat]}
              </span>
              <div className="w-20 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', barFill(metrics[cat]!))}
                  style={{ width: `${(metrics[cat]! / 5) * 100}%` }}
                />
              </div>
              <ScoreBadge score={metrics[cat]!} size="sm" />
            </div>

            <div className="px-5 pb-4 pt-4 bg-secondary/5 border border-border/20 rounded-b-lg space-y-4">
              <AggregatedRatingBreakdown questions={questions} aggregateScore={metrics[cat]!} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Shared sign-in prompt for the Stanford-only evaluation data. */
export function EvalLoginGate({ title = 'Course reviews are Stanford-only' }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 gap-3 border border-border/50 rounded-xl bg-secondary/10">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Lock size={18} className="text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-[260px]">
          Log in with your Stanford account to view student evaluations, ratings, and comments.
        </p>
      </div>
      <StanfordLoginButton
        source="eval_gate"
        signingInLabel="Redirecting to Stanford…"
        className="mt-1 inline-flex items-center justify-center rounded-full bg-foreground text-background px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] gap-2 h-auto"
      />
    </div>
  )
}

// --- Main Component ---

type EvalTab = 'overview' | 'instructors' | 'comments'


interface CourseEvaluationsProps {
  /** All course IDs in the cross-list group (e.g. CS 24, LINGUIST 35, BILL 99). Chart/comments include data from all. */
  courseIds: string[]
  subject: string
  code: string
  forcedTab?: 'overview' | 'instructors' | 'comments'
  /**
   * Whether the catalog dump flagged this cross-list group as first-time-offered:
   * true swaps the empty state from "our records start in 2021" to "new course",
   * `undefined` means the catalog hasn't loaded yet and the empty state must wait
   * rather than assert either. Required (not optional) so a caller can't leave it
   * unresolved by accident and hang the empty state on a spinner.
   */
  isNew: boolean | undefined
}

export function CourseEvaluations({ courseIds, subject, code, forcedTab, isNew }: CourseEvaluationsProps) {
  const fetchBulkEvaluations = useEvaluationStore(state => state.fetchBulkEvaluations)
  const getMergedEvaluations = useEvaluationStore(state => state.getMergedEvaluations)
  const loadingCourses = useEvaluationStore(state => state.loadingCourses)
  const errorCourses = useEvaluationStore(state => state.errorCourses)
  const evaluationsById = useEvaluationStore(state => state.evaluations)
  const user = useAuthStore(state => state.user)
  const authLoading = useAuthStore(state => state.isLoading)
  const canViewEvals = Boolean(user) || isDevEvalsUnlocked()
  const [activeTermFilter, setActiveTermFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<EvalTab>(forcedTab || 'overview')
  const [expandedInstructor, setExpandedInstructor] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<QuestionCategory | null>(null)

  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab)
    }
  }, [forcedTab])

  const isLoading = courseIds.some(id => !!loadingCourses[id])
  const hasError = courseIds.some(id => !!errorCourses[id])
  const evaluations = useMemo(() => getMergedEvaluations(courseIds), [getMergedEvaluations, courseIds, evaluationsById])

  const courseIdsKey = courseIds.join(',')
  useEffect(() => {
    if (canViewEvals && courseIds.length > 0) fetchBulkEvaluations(courseIds)
  }, [courseIdsKey, fetchBulkEvaluations, canViewEvals])

  useEffect(() => {
    if (!authLoading && !canViewEvals) track('eval_gate_viewed', { subject, code })
  }, [authLoading, canViewEvals, subject, code])

  // Unique terms (newest first)
  const evalTerms = useMemo(() => {
    const terms = [...new Set(evaluations.map(e => e.term))].sort((a, b) => compareTerms(b, a))
    return terms
  }, [evaluations])

  const filteredEvals = useMemo(() => {
    if (activeTermFilter === 'all') return evaluations
    return evaluations.filter(e => e.term === activeTermFilter)
  }, [evaluations, activeTermFilter])

  const instructors = useMemo(() => computeInstructorStats(filteredEvals), [filteredEvals])
  const allComments = useMemo(() => {
    // De-dupe identical comments that can appear across multiple evaluation records
    // (e.g. cross-listed or co-taught offerings sharing the same comment pool).
    const seen = new Set<string>()
    const out: CommentEntry[] = []
    for (const e of filteredEvals) {
      for (const c of e.comments) {
        const key = decodeHtmlEntities(c).trim().toLowerCase()
        if (key && !seen.has(key)) {
          seen.add(key)
          out.push({ text: c })
        }
      }
    }
    return out
  }, [filteredEvals])
  const hasMultipleInstructors = instructors.length > 1

  const handleTermFilterChange = useCallback((term: string) => {
    setActiveTermFilter(term)
    setExpandedInstructor(null)
    setExpandedQuestion(null)
    // If switching to a term and on instructors tab but only 1 instructor for that filter, go to overview
    if (activeTab === 'instructors') {
      setActiveTab('overview')
    }
  }, [activeTab])

  // Gated: course evaluations are Stanford-login-only (dev bypass via NEXT_PUBLIC_DEV_UNLOCK_EVALS)
  if (!canViewEvals) {
    if (authLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading evaluations...</span>
        </div>
      )
    }
    return <EvalLoginGate />
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading evaluations...</span>
      </div>
    )
  }

  // Error
  if (hasError) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Could not load evaluation data.
      </div>
    )
  }

  // No data
  if (evaluations.length === 0) {
    // `isNew` rides on the client-side catalog, not the server-fetched course
    // row, so on a hard load it is unresolved for a moment. Keep spinning rather
    // than flash the 2021 line at a course that turns out to be new.
    if (isNew === undefined) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading evaluations...</span>
        </div>
      )
    }
    // A first-time offering has no evaluations anywhere, so pointing at our
    // 2021 cutoff (or at EvaluationKit) would imply data we just don't show.
    if (isNew) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm">This is a new course, so there are no evaluations yet.</p>
        </div>
      )
    }
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-muted-foreground text-sm">No evaluation data found. Note: Our records only go back to <strong>Fall 2021</strong>.</p>
        <a
          href={`https://stanford.evaluationkit.com/Report/Public/Results?Course=${encodeURIComponent(subject + ' ' + code)}&Search=true`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 px-4 py-2 rounded-full transition-colors"
        >
          Search EvaluationKit for previous quarters
          <ExternalLink size={12} />
        </a>
      </div>
    )
  }

  const ratingCats = RATING_CATEGORIES
  const tabItems: { key: EvalTab, label: string, count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    ...(hasMultipleInstructors ? [{ key: 'instructors' as EvalTab, label: 'Instructors', count: instructors.length }] : []),
    { key: 'comments', label: 'Comments', count: allComments.length }
  ]

  return (
    <div className="space-y-4">
      {/* Term filter pills */}
      {evalTerms.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleTermFilterChange('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              activeTermFilter === 'all'
                ? 'bg-foreground text-background'
                : 'bg-secondary/50 hover:bg-secondary text-muted-foreground'
            )}
          >
            All ({evaluations.length})
          </button>
          {evalTerms.map(term => {
            const count = evaluations.filter(e => e.term === term).length
            return (
              <button
                key={term}
                type="button"
                onClick={() => handleTermFilterChange(term)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeTermFilter === term
                    ? 'bg-foreground text-background'
                    : 'bg-secondary/50 hover:bg-secondary text-muted-foreground'
                )}
              >
                {term} {count > 1 ? `(${count})` : ''}
              </button>
            )
          })}
        </div>
      )}

      {/* Tab navigation - only show if no forcedTab */}
      {!forcedTab && (
        <div className="flex border-b border-border/50">
          {tabItems.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors relative',
                activeTab === tab.key
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="text-[10px] text-muted-foreground ml-1">({tab.count})</span>
              )}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="min-h-[200px]">

        {/* === Overview tab === */}
        {activeTab === 'overview' && <EvaluationOverview evaluations={filteredEvals} />}

        {/* === Instructors tab (only with 2+ instructors) === */}
        {activeTab === 'instructors' && hasMultipleInstructors && (
          <div className="border border-border/50 rounded-xl overflow-hidden">
            <div
              className="grid gap-2 px-4 py-2.5 bg-secondary/30 border-b border-border/40"
              style={{ gridTemplateColumns: '1fr repeat(4, minmax(40px, 52px))' }}
            >
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instructor</div>
              {ratingCats.map(cat => (
                <div key={cat} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  {CATEGORY_SHORT[cat]}
                </div>
              ))}
            </div>

            {instructors.map(inst => (
              <InstructorRow
                key={inst.name}
                instructor={inst}
                ratingCats={ratingCats}
                isExpanded={expandedInstructor === inst.name}
                onToggle={() => setExpandedInstructor(expandedInstructor === inst.name ? null : inst.name)}
                evals={filteredEvals}
              />
            ))}
          </div>
        )}

        {/* === Comments tab === */}
        {activeTab === 'comments' && (
          <CommentsPanel comments={allComments} />
        )}
      </div>

      {/* Footer link */}

    </div >
  )
}
