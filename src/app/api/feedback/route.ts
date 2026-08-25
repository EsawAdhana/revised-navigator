import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseFeedbackKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
const resendApiKey = process.env.RESEND_API_KEY || ''
const feedbackEmailTo = process.env.FEEDBACK_EMAIL_TO || 'adhanaesaw@gmail.com'
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Stanford Root <onboarding@resend.dev>'

const MAX_TEXT_LENGTH = 2000
const ALLOWED_TYPES = ['feedback', 'request'] as const

export async function POST (request: Request) {
  if (!supabaseUrl || !supabaseFeedbackKey) {
    return NextResponse.json(
      { error: 'Feedback is not configured' },
      { status: 503 }
    )
  }

  // Do not read auth cookies. Feedback stays anonymous even for signed-in users.
  const supabase = createClient(supabaseUrl, supabaseFeedbackKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Best-effort throttle: 5 submissions / hour per IP.
  if (!rateLimit(`feedback:${getClientIp(request)}`, 5, 60 * 60 * 1000)) {
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
  if (resendApiKey) {
    after(async () => {
      try {
        const resend = new Resend(resendApiKey)
        const { error: emailErr } = await resend.emails.send({
          from: fromEmail,
          to: feedbackEmailTo,
          subject: `[Stanford Root] New feedback: ${typeInput}`,
          text: `Type: ${typeInput}\nFrom: Anonymous\n\n${text}`
        })
        if (emailErr) {
          console.error('Feedback email send error:', emailErr)
        }
      } catch (emailErr) {
        console.error('Feedback email send error:', emailErr)
      }
    })
  } else {
    console.warn('Feedback saved but email skipped: RESEND_API_KEY is not set')
  }

  return NextResponse.json({ ok: true })
}
