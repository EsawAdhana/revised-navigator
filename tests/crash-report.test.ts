import { describe, it, expect } from 'vitest'
import { crashProps } from '@/lib/crash-report'

describe('crashProps', () => {
  it('keeps the message, name, digest and the first real stack frame', () => {
    const err = Object.assign(new TypeError('x is not a function'), {
      digest: '2891374123',
      stack: 'TypeError: x is not a function\n    at Schedule (app/schedule/page.tsx:41:9)\n    at renderWithHooks',
    })
    expect(crashProps(err)).toEqual({
      message: 'x is not a function',
      name: 'TypeError',
      digest: '2891374123',
      frame: 'at Schedule (app/schedule/page.tsx:41:9)',
    })
  })

  it('omits digest and frame instead of sending undefined', () => {
    const err = new Error('plain')
    err.stack = undefined
    expect(crashProps(err)).toEqual({ message: 'plain', name: 'Error' })
  })

  it('skips the stack header and finds the first "at" line even when indented oddly', () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\nsome noise\n\t at  weird (x.ts:1:1)'
    expect(crashProps(err).frame).toBe('at  weird (x.ts:1:1)')
  })

  it('trims a message that would be cut by the /api/track 256-char cap', () => {
    const err = new Error('a'.repeat(1000))
    expect(crashProps(err).message.length).toBe(240)
  })

  it('trims an enormous single stack frame', () => {
    const err = new Error('boom')
    err.stack = `Error: boom\n    at ${'b'.repeat(500)}`
    expect((crashProps(err).frame as string).length).toBe(200)
  })

  it.each([
    ['a thrown string', 'just a string', 'just a string'],
    ['a thrown object', { a: 1 }, '{"a":1}'],
    ['null', null, 'null'],
    ['undefined', undefined, 'null'],
  ])('records %s rather than dropping the crash', (_label, thrown, expected) => {
    expect(crashProps(thrown)).toEqual({ message: expected, name: 'NonError' })
  })

  it('never returns an empty message, which would be unqueryable', () => {
    expect(crashProps(new Error('')).message).toBe('unknown')
  })
})
