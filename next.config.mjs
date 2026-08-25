import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  turbopack: {
    root: path.resolve(__dirname)
  },
  async headers () {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              // cdn.humanbehavior.co is in script-src because the recording SDK is
              // loaded from the CDN rather than bundled: the loader script and the
              // recorder it pulls in are both script fetches from that host. A
              // bundled npm build only needed 'self', which is why this directive
              // did not list it before. connect-src already covers the ingestion
              // host via https://*.humanbehavior.co.
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.humanbehavior.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://syllabus.stanford.edu https://*.humanbehavior.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          }
        ]
      }
    ]
  }
};

export default nextConfig;
