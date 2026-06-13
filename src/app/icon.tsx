import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#8C1515',
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
          <path d="M24 41 V20" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
          <path d="M24 30 C15 30 9 24 9 15 C18 15 24 21 24 30 Z" fill="#fff" />
          <path d="M24 24 C33 24 39 18 39 9 C30 9 24 15 24 24 Z" fill="#fff" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
