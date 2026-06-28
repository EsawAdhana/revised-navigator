'use client'

import Link from 'next/link'
import type { FormEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  MousePointerClick,
  Network,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import {
  getHumanBehaviorTracker,
  identifyHumanBehaviorUser,
  trackHumanBehaviorEvent,
} from '@/lib/humanbehavior'

type ActionStatus = {
  label: string
  message: string
  at: string
}

function nowLabel() {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())
}

export default function HumanBehaviorTestLabPage() {
  const [lastAction, setLastAction] = useState<ActionStatus | null>(null)
  const [clickCount, setClickCount] = useState(0)

  useEffect(() => {
    track('page_viewed', { path: '/test-lab' })
    void trackHumanBehaviorEvent('stanford_root_test_lab_viewed', {
      path: '/test-lab',
      source: 'manual_e2e',
    })
  }, [])

  const recordAction = (label: string, message: string) => {
    setLastAction({ label, message, at: nowLabel() })
  }

  const runCourseSearch = async () => {
    track('search_performed', { query: 'CS 106A', source: 'humanbehavior_test_lab' })
    await trackHumanBehaviorEvent('stanford_root_course_search_tested', {
      query: 'CS 106A',
      source: 'manual_e2e',
    })
    recordAction('Course search', 'Sent a search event for CS 106A.')
  }

  const runFakeOauth = async () => {
    track('login_started', { source: 'humanbehavior_test_lab' })
    await identifyHumanBehaviorUser({
      email: 'local-test-student@stanford.edu',
      name: 'Local Test Student',
      source: 'humanbehavior_test_lab',
      role: 'student',
    })
    await trackHumanBehaviorEvent('stanford_root_fake_oauth_completed', {
      provider: 'stanford_sso',
      source: 'manual_e2e',
    })
    track('login_completed', { source: 'humanbehavior_test_lab' })
    recordAction('Fake OAuth', 'Identified a local test student and sent a fake OAuth completion event.')
  }

  const runFakeStripe = async () => {
    recordAction('Stripe customer', 'Creating a Stripe test customer + subscription...')
    await trackHumanBehaviorEvent('stanford_root_checkout_started', { source: 'manual_e2e' })
    const response = await fetch('/api/test-lab/simulate-customer', { method: 'POST' })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      customerId?: string
      amountCents?: number
      error?: string
    } | null
    if (!response.ok || !data?.ok) {
      recordAction('Stripe customer', `Could not create customer: ${data?.error ?? response.status}.`)
      return
    }
    await trackHumanBehaviorEvent('stanford_root_checkout_completed', {
      source: 'manual_e2e',
      stripe_customer_id: data.customerId,
      amount_cents: data.amountCents,
    })
    recordAction(
      'Stripe customer',
      `Created ${data.customerId} with a $${((data.amountCents ?? 0) / 100).toFixed(2)}/mo trialing subscription. Sync Stripe in HumanBehavior to see it.`,
    )
  }

  const runApiFetch = async () => {
    const response = await fetch('/api/courses?search=CS%20106A', {
      cache: 'no-store',
    })
    await trackHumanBehaviorEvent('stanford_root_courses_api_checked', {
      ok: response.ok,
      status: response.status,
      source: 'manual_e2e',
    })
    recordAction('Courses API', `Fetched /api/courses and got HTTP ${response.status}.`)
  }

  const runNetworkError = async () => {
    const response = await fetch(`/api/humanbehavior-test-lab/missing-${Date.now()}`, {
      cache: 'no-store',
    })
    await trackHumanBehaviorEvent('stanford_root_expected_404_seen', {
      status: response.status,
      source: 'manual_e2e',
    })
    recordAction('Expected 404', `Generated an expected HTTP ${response.status} for network/error testing.`)
  }

  const runConsoleSignal = async () => {
    console.warn('HumanBehavior test lab synthetic warning', { source: 'manual_e2e' })
    console.error('HumanBehavior test lab synthetic error', { source: 'manual_e2e' })
    await trackHumanBehaviorEvent('stanford_root_console_signal_tested', {
      level: 'warn_error',
      source: 'manual_e2e',
    })
    recordAction('Console signal', 'Wrote synthetic warn/error logs and sent a matching custom event.')
  }

  const runRepeatedClick = async () => {
    const nextCount = clickCount + 1
    setClickCount(nextCount)
    await trackHumanBehaviorEvent('stanford_root_repeated_click', {
      count: nextCount,
      source: 'manual_e2e',
    })
    recordAction('Repeated click', `Clicked the rage/dead-click target ${nextCount} time${nextCount === 1 ? '' : 's'}.`)
  }

  const submitGhostForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const interest = String(data.get('interest') || 'unknown')
    await trackHumanBehaviorEvent('stanford_root_ghost_form_submitted', {
      interest,
      source: 'manual_e2e',
    })
    recordAction('Ghost form', `Submitted the ghost interest form with interest "${interest}".`)
  }

  const sdkReady = Boolean(getHumanBehaviorTracker()?.customEvent)

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-5 rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          <Button asChild variant="ghost" className="w-fit gap-2 px-0">
            <Link href="/browse">
              <ArrowLeft className="h-4 w-4" />
              Back to Stanford Root
            </Link>
          </Button>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <GraduationCap className="h-4 w-4" />
              HumanBehavior local E2E lab
            </div>
            <h1 className="text-balance text-4xl font-bold tracking-tight">
              Generate clean Stanford Root traffic for your local HumanBehavior project.
            </h1>
            <p className="max-w-3xl text-muted-foreground">
              Use this page from <code>localhost:3003</code> after HumanBehavior is running on{' '}
              <code>localhost:3000</code> and ingestion is running on <code>localhost:8000</code>.
              The SDK is wired to your local <code>hb_dev</code> project by default in development.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {sdkReady ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                SDK status
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {sdkReady
                  ? 'HumanBehavior tracker is ready.'
                  : 'SDK is still loading, or the local ingestion stack is not reachable yet.'}
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <div className="text-sm font-semibold">Last action</div>
              <p className="mt-2 text-sm text-muted-foreground">
                {lastAction
                  ? `${lastAction.at} - ${lastAction.label}: ${lastAction.message}`
                  : 'No manual event sent yet.'}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <ActionCard
            icon={<Search className="h-5 w-5" />}
            title="Course Search"
            description="Sends a search event that should show up as Stanford Root product activity."
            actionLabel="Send search event"
            onAction={runCourseSearch}
          />
          <ActionCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Ghost OAuth"
            description="Identifies a fake Stanford student and sends a simple OAuth completion event."
            actionLabel="Run fake OAuth"
            onAction={runFakeOauth}
          />
          <ActionCard
            icon={<CreditCard className="h-5 w-5" />}
            title="Stripe Customer"
            description="Creates a real Stripe test customer + trialing subscription + paid invoice on the connected account HumanBehavior syncs."
            actionLabel="Create test customer"
            onAction={runFakeStripe}
          />
          <ActionCard
            icon={<Network className="h-5 w-5" />}
            title="API And Network"
            description="Hits a real local API and an expected 404 so network capture has something to record."
            actionLabel="Fetch APIs"
            onAction={async () => {
              await runApiFetch()
              await runNetworkError()
            }}
          />
          <ActionCard
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Console Logs"
            description="Emits synthetic warning and error logs for log capture testing."
            actionLabel="Emit logs"
            onAction={runConsoleSignal}
          />
          <ActionCard
            icon={<MousePointerClick className="h-5 w-5" />}
            title="Repeated Click Target"
            description="Click this a few times quickly to create click, rage-click, and dead-click-like signals."
            actionLabel={`Click target ${clickCount}`}
            onAction={runRepeatedClick}
          />
        </section>

        <form
          onSubmit={submitGhostForm}
          className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Ghost Interest Form
            </h2>
            <p className="text-sm text-muted-foreground">
              Submitting this form gives the SDK a real form interaction and sends a matching custom event.
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="space-y-2">
              <span className="text-sm font-medium">What do you want to test?</span>
              <select
                name="interest"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="analytics"
              >
                <option value="analytics">Analytics dashboard</option>
                <option value="replay">Session replay</option>
                <option value="reports">AI reports</option>
                <option value="stripe">Stripe revenue</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full sm:w-auto">
                Submit ghost form
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}

function ActionCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode
  title: string
  description: string
  actionLabel: string
  onAction: () => void | Promise<void>
}) {
  const [isRunning, setIsRunning] = useState(false)

  const handleClick = async () => {
    setIsRunning(true)
    try {
      await onAction()
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button className="mt-5 w-full" onClick={handleClick} disabled={isRunning}>
        {isRunning ? 'Sending...' : actionLabel}
      </Button>
    </article>
  )
}
