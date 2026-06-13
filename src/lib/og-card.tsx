import { ImageResponse } from 'next/og'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

/** Shared branded social share card used by both the Open Graph and Twitter image routes. */
export function renderOgCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          background: 'linear-gradient(135deg, #2a0d0d 0%, #1a1110 55%, #0f0c0b 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 88,
              height: 88,
              borderRadius: 22,
              background: '#8C1515',
            }}
          >
            <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
              <path d="M24 41 V20" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
              <path d="M24 30 C15 30 9 24 9 15 C18 15 24 21 24 30 Z" fill="#fff" />
              <path d="M24 24 C33 24 39 18 39 9 C30 9 24 15 24 24 Z" fill="#fff" />
            </svg>
          </div>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Stanford Root</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 900,
          }}
        >
          <span>A better way to browse&nbsp;</span>
          <span style={{ color: '#E8857F' }}>Stanford courses</span>
        </div>

        <div style={{ fontSize: 34, color: 'rgba(255,255,255,0.72)', marginTop: 32, maxWidth: 880 }}>
          Search the catalog, read student evaluations, and build your schedule.
        </div>
      </div>
    ),
    { ...OG_SIZE }
  )
}
