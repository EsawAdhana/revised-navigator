import { afterEach, describe, it, expect, vi } from 'vitest'
import { fetchCatalogJson } from '@/lib/catalog-fetch'

const original = globalThis.fetch

afterEach(() => {
  globalThis.fetch = original
  vi.restoreAllMocks()
})

function jsonOnce(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('fetchCatalogJson', () => {
  it('returns the payload on the first try', async () => {
    globalThis.fetch = vi.fn(async () => jsonOnce([{ id: 'CS103' }])) as unknown as typeof fetch
    await expect(fetchCatalogJson('/api/courses')).resolves.toEqual([{ id: 'CS103' }])
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries once and succeeds — this is what the Retry button could never do before', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('network down')
      return jsonOnce([{ id: 'CS106A' }])
    }) as unknown as typeof fetch
    await expect(fetchCatalogJson('/api/courses')).resolves.toEqual([{ id: 'CS106A' }])
    expect(calls).toBe(2)
  })

  it('retries a 500 as well as a thrown error', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls++
      if (calls === 1) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response
      return jsonOnce([])
    }) as unknown as typeof fetch
    await expect(fetchCatalogJson('/api/courses')).resolves.toEqual([])
    expect(calls).toBe(2)
  })

  it('gives up after the last attempt and surfaces the real error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('still down')
    }) as unknown as typeof fetch
    await expect(fetchCatalogJson('/api/courses')).rejects.toThrow('still down')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not swallow a malformed body as an empty catalog', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected end of JSON input')
      },
    }) as unknown as Response) as unknown as typeof fetch
    await expect(fetchCatalogJson('/api/courses')).rejects.toThrow('Unexpected end of JSON input')
  })

  it('passes an abort signal so a stalled request cannot hang forever', async () => {
    const seen: RequestInit[] = []
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      seen.push(init)
      return jsonOnce([])
    }) as unknown as typeof fetch
    await fetchCatalogJson('/api/courses')
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal)
  })
})
