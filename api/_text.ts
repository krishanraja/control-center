import { createHash } from 'node:crypto'

// Shared text-normalization primitives for cross-surface dedup. Promoted out of
// api/_seedSources.ts where `fingerprint` previously lived — it was only used
// for the seed-candidate path (ContentSeedRail) and never ran at the main
// idea-capture insert, which is the root cause of the duplicate-storm in the
// Content triage.

/** Normalized title fingerprint for near-dup collapse. Lower-case, punctuation
 *  collapsed to spaces, capped at 64 chars. */
export function fingerprint(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 64)
}

/** Same as fingerprint() but uncapped — for the title_norm column where the
 *  full normalized form lives. */
export function titleNorm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Tracking-parameter blocklist. Strip these so the same article from Twitter
// and from Substack collapses to one canonical URL. List is conservative —
// anything that genuinely changes the destination (e.g. id, slug params) stays.
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_brand', 'utm_name',
  'mc_cid', 'mc_eid',
  'fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid',
  'ref', 'referrer', 'referer', 'source', '_hsenc', '_hsmi',
  'hss_channel', 'igshid', 'spm', 'share_source', 'share',
])

/** Canonical URL: lowercased host, https-normalized, tracking params stripped,
 *  trailing slash removed, fragment dropped. Returns null if the input isn't a
 *  parseable URL — caller decides whether absence is OK. */
export function canonicalUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) }
  catch {
    // Tolerate bare hostnames ("example.com/foo") by prefixing https://
    try { u = new URL(`https://${raw}`) }
    catch { return null }
  }
  // Lower-case host, strip leading www.
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
  // Strip tracking params.
  const keep: [string, string][] = []
  u.searchParams.forEach((v, k) => {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.push([k, v])
  })
  u.search = ''
  // Reapply preserved params sorted by key so identical inputs canonicalize to
  // identical outputs regardless of original order.
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [k, v] of keep) u.searchParams.append(k, v)
  // Drop fragment.
  u.hash = ''
  // Always https for HTTP/HTTPS-only canonical form; leave other protocols.
  if (u.protocol === 'http:' || u.protocol === 'https:') u.protocol = 'https:'
  // Drop trailing slash from pathname (but keep root /).
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '')
  }
  return u.toString()
}

/** Lower-cased + trimmed email. Returns null if not parseable as an email. */
export function emailNorm(input: string | null | undefined): string | null {
  if (!input) return null
  const e = String(input).trim().toLowerCase()
  return e.includes('@') && e.length > 3 ? e : null
}

/** Normalize a LinkedIn URL / handle to a single canonical form. */
export function linkedinNorm(input: string | null | undefined): string | null {
  if (!input) return null
  const c = canonicalUrl(input)
  if (!c) return null
  return c.replace(/\/+$/, '').toLowerCase()
}

/** SHA-256 of a string, hex-encoded. Used for content_hash. */
export function contentHash(input: string | null | undefined): string | null {
  const raw = (input || '').trim()
  if (!raw) return null
  // Cap at 2 KB so the hash is stable even when the snippet/body grows over
  // time but the lead paragraph stays the same.
  const capped = raw.slice(0, 2048)
  return createHash('sha256').update(capped, 'utf8').digest('hex')
}
