import { NextResponse, after } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { Resend } from 'resend'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const resendApiKey = process.env.RESEND_API_KEY || ''
const feedbackEmailTo = process.env.FEEDBACK_EMAIL_TO || ''
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Stanford Root <onboarding@resend.dev>'

const MAX_TEXT_LENGTH = 2000
const ALLOWED_TYPES = ['feedback', 'request'] as const

export async function POST (request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Feedback is not configured' },
      { status: 503 }
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll () {
        return cookieStore.getAll()
      },
      setAll (cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Ignored when called from Route Handler
        }
      }
    }
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.email?.endsWith('@stanford.edu')) {
    return NextResponse.json({ error: 'Stanford account required' }, { status: 403 })
  }

  // Best-effort throttle: 5 submissions / hour per user.
  if (!rateLimit(`feedback:${user.id}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body: { text?: string; type?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text must be at most ${MAX_TEXT_LENGTH} characters` },
      { status: 400 }
    )
  }

  const typeInput = body.type && ALLOWED_TYPES.includes(body.type as typeof ALLOWED_TYPES[number])
    ? body.type
    : 'feedback'

  // Map API types to DB schema: 'feedback' -> 'general', 'request' -> 'request'
  const type = typeInput === 'feedback' ? 'general' : typeInput

  const { error: err } = await supabase
    .from('app_feedback')
    .insert({ text, type })

  if (err) {
    console.error('Feedback insert error:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Failed to save feedback' : err.message },
      { status: 500 }
    )
  }

  // Send the notification email after responding so request latency isn't tied to the email provider
  if (resendApiKey && feedbackEmailTo) {
    after(async () => {
      try {
        const resend = new Resend(resendApiKey)
        await resend.emails.send({
          from: fromEmail,
          to: feedbackEmailTo,
          subject: `[Stanford Root] New feedback: ${typeInput}`,
          text: `Type: ${typeInput}\nFrom: ${user.email}\n\n${text}`
        })
      } catch (emailErr) {
        console.error('Feedback email send error:', emailErr)
      }
    })
  }

  return NextResponse.json({ ok: true })
}
