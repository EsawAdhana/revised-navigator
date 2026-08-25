/**
 * Turns whatever the error boundary was handed into props worth recording.
 *
 * The boundary only ever `console.error`d, so a crash on a student's phone left
 * no trace anywhere — `/schedule` and `/courses/*` crashed in 3 sessions over
 * 3 days with no way to tell why. `/api/track` caps prop strings at 256 chars,
 * so the message is trimmed here rather than silently cut there, and the stack
 * is reduced to its first frame, which is the part that names the file.
 */
const MAX_MESSAGE = 240
const MAX_FRAME = 200

export interface CrashProps extends Record<string, unknown> {
  message: string
  name: string
  digest?: string
  frame?: string
}

/** First stack line that looks like a call site, minus the message header. */
function firstFrame(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  const line = stack
    .split('\n')
    .map(l => l.trim())
    .find(l => l.startsWith('at '))
  return line ? line.slice(0, MAX_FRAME) : undefined
}

export function crashProps(error: unknown): CrashProps {
  if (!(error instanceof Error)) {
    // A thrown string or object still deserves a record rather than nothing.
    const text = typeof error === 'string' ? error : JSON.stringify(error ?? null)
    return { message: (text || 'unknown').slice(0, MAX_MESSAGE), name: 'NonError' }
  }
  const digest = (error as Error & { digest?: string }).digest
  const frame = firstFrame(error.stack)
  return {
    message: (error.message || 'unknown').slice(0, MAX_MESSAGE),
    name: error.name || 'Error',
    ...(digest ? { digest } : {}),
    ...(frame ? { frame } : {}),
  }
}
