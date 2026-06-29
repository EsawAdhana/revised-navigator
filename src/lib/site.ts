/**
 * Canonical site origin, used for metadataBase, canonical URLs, sitemap, and
 * robots. Set NEXT_PUBLIC_SITE_URL to override (no trailing slash); defaults to
 * the production custom domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://stanfordroot.com'
).replace(/\/+$/, '')
