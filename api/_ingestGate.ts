import { emailNorm, linkedinNorm } from './_text.js'

// The gate every contact import passes through.
//
// ── Why this exists, in one incident ────────────────────────────────────────
// A consolidated Apollo export of 4,105 leads arrived carrying a linkedin_url
// column. 1,381 of those rows held a URL belonging to somebody else, and 370
// were provably another named row in the same file — Madison Benveniste's row
// carried Cally Baute's profile, and Cally Baute was herself a row. A column
// had slipped during the merge.
//
// Imported naively it would have written a stranger's LinkedIn profile onto 533
// existing contacts. The Network tab renders that URL as a one-click button and
// promises it lands on the person, so the failure would not have looked like
// bad data: it would have looked like Krish opening a conversation with the
// wrong human, confidently.
//
// What caught it was a check done by hand, once, in a throwaway script. That is
// not a control. This module is the same check, owned, tested and mandatory, so
// the next file of unknown provenance cannot do what that one nearly did.
//
// ── The principle ───────────────────────────────────────────────────────────
// An import may only ever IMPROVE a record. Every rule below is a specific
// expression of that: a worse source cannot overwrite a better one, an
// unverifiable value is stored where it cannot be acted on, and anything that
// fails its own self-consistency test is dropped rather than guessed at.

/** Where a fact came from, ordered by how much it deserves to be believed.
 *  Higher wins. A lower-ranked source never overwrites a higher-ranked one. */
export const SOURCE_TRUST = {
  /** Read off the person's own profile by a provider. */
  read_profile: 50,
  /** The person's own mail. They wrote their name in the From header. */
  mail_header: 40,
  /** Krish typed it, or confirmed it in the UI. */
  manual: 35,
  /** A LinkedIn connections export: the URL is the identity, by construction. */
  linkedin_export: 30,
  /** A roster or event list naming the person. */
  roster: 20,
  /** A bulk lead file of unverified provenance. */
  lead_file: 10,
  /** Derived, never asserted: a pattern-guessed address, a search fallback. */
  inferred: 0,
} as const
export type IngestSource = keyof typeof SOURCE_TRUST

/** Tokens of three or more letters. The unit both halves of the LinkedIn check
 *  are compared in. */
function tokens(s: string | null | undefined): Set<string> {
  return new Set((s || '').toLowerCase().match(/[a-z]{3,}/g) || [])
}

export interface LinkedInVerdict {
  /** The canonical URL, or null when it must not be written. */
  url: string | null
  /** 'verified'  the slug is consistent with this person's own name
   *  'unverifiable' a slug that shares nothing with the name — could be a
   *                 vanity handle, could be the wrong human; indistinguishable
   *  'malformed'  not a personal LinkedIn profile URL at all */
  verdict: 'verified' | 'unverifiable' | 'malformed'
  reason?: string
}

/**
 * Is this LinkedIn URL plausibly THIS person's?
 *
 * A slug sharing a token with the name cannot belong to someone else by
 * accident: `jess-triffitt` on Jessica Triffitt's row is hers. That is the only
 * signal available without fetching the profile, and it is enough to separate
 * a clean file from a shifted one.
 *
 * It deliberately cannot clear a legitimate vanity handle — `adgirl1075` is
 * Melissa Gordon's real profile and comes back `unverifiable`. That is the
 * right trade. The cost of rejecting a good URL is one contact keeping the
 * "Find on LinkedIn" search fallback, which works. The cost of accepting a bad
 * one is Krish messaging a stranger believing the system verified them.
 */
export function checkLinkedIn(fullName: string | null | undefined, rawUrl: string | null | undefined): LinkedInVerdict {
  const m = /linkedin\.com\/(?:m\/profile\/)?in\/([^/?#\s]+)/i.exec(rawUrl || '')
  if (!m) return { url: null, verdict: 'malformed', reason: 'not a /in/ profile URL' }
  const slug = decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, '')
  if (slug.length < 2) return { url: null, verdict: 'malformed', reason: 'empty slug' }

  const url = `https://www.linkedin.com/in/${slug}`
  const name = tokens(fullName)
  if (!name.size) return { url, verdict: 'unverifiable', reason: 'no name to check against' }

  // Strip LinkedIn's disambiguating suffix before comparing: profiles collide,
  // so real slugs carry a hex tail — `clare-nordstrom-0ba40278` is Clare
  // Nordstrom and must not be rejected for the trailing noise.
  const slugTokens = tokens(slug.replace(/-[0-9a-f]{6,}$/i, ''))
  for (const t of slugTokens) if (name.has(t)) return { url, verdict: 'verified' }

  // Also catch the run-together form: "mjbeebe" for Michael Beebe, "linietsky"
  // for Larry Linietsky. A surname embedded in a handle is still that surname.
  const flat = slug.replace(/[^a-z]/g, '')
  for (const t of name) if (t.length >= 4 && flat.includes(t)) return { url, verdict: 'verified' }

  return { url, verdict: 'unverifiable', reason: 'slug shares nothing with the name' }
}

export interface EmailVerdict {
  /** Safe to write to contacts.email, and therefore reachable by every bulk
   *  path that reads email_normalized. */
  verified: string | null
  /** A pattern guess. Stored in raw so a human can choose to use it; never
   *  written where a campaign can pick it up. */
  guessed: string | null
}

/**
 * Split an address by whether anyone has confirmed it answers.
 *
 * The distinction is the whole point: contacts.email feeds Instantly and every
 * other bulk path, so an unconfirmed address there is a bounce against Krish's
 * sending reputation, sent to somebody who may be a peer.
 */
export function classifyEmail(value: string | null | undefined, source: IngestSource): EmailVerdict {
  const e = emailNorm(value)
  if (!e) return { verified: null, guessed: null }
  return SOURCE_TRUST[source] <= SOURCE_TRUST.inferred
    ? { verified: null, guessed: e }
    : { verified: e, guessed: null }
}

export interface FieldClaim<T> { value: T | null | undefined; source: IngestSource }

/**
 * Keep the better of what we hold and what arrived.
 *
 * `existing` wins ties, because a value already in the database has survived
 * whatever scrutiny it has had, and churn on equal evidence is noise.
 */
export function bestOf<T>(existing: FieldClaim<T>, incoming: FieldClaim<T>): T | null | undefined {
  const has = (v: unknown) => v !== null && v !== undefined && v !== ''
  if (!has(incoming.value)) return existing.value
  if (!has(existing.value)) return incoming.value
  return SOURCE_TRUST[incoming.source] > SOURCE_TRUST[existing.source] ? incoming.value : existing.value
}

export interface ExistingContact {
  full_name?: string | null
  email_normalized?: string | null
  linkedin_url?: string | null
  company?: string | null
  title?: string | null
  raw?: Record<string, unknown> | null
}

export interface IncomingContact {
  full_name?: string | null
  email?: string | null
  linkedin_url?: string | null
  company?: string | null
  title?: string | null
}

export interface GatedPatch {
  patch: Record<string, unknown>
  /** What the gate refused and why. Importers surface this rather than
   *  swallowing it: a file that is 58% rejected is a broken file, and the only
   *  way anyone learns that is if the number is reported. */
  rejected: string[]
}

/**
 * Turn an incoming row into the patch it is allowed to make.
 *
 * Returns only the fields that actually improve the record, so a caller can
 * apply the result without re-deriving any of these rules — which is the point.
 * Reimplementing them per importer is how the Apollo file nearly landed.
 */
export function gateContact(
  existing: ExistingContact | null,
  incoming: IncomingContact,
  source: IngestSource,
): GatedPatch {
  const cur = existing || {}
  const patch: Record<string, unknown> = {}
  const rejected: string[] = []

  const name = bestOf({ value: cur.full_name, source: 'manual' }, { value: incoming.full_name, source })
  if (name && name !== cur.full_name) patch.full_name = name

  const li = checkLinkedIn(name ?? incoming.full_name, incoming.linkedin_url)
  if (li.verdict === 'verified') {
    const chosen = bestOf({ value: cur.linkedin_url, source: 'manual' }, { value: li.url, source })
    if (chosen && chosen !== cur.linkedin_url) {
      patch.linkedin_url = chosen
      patch.linkedin_url_norm = linkedinNorm(chosen)
    }
  } else if (incoming.linkedin_url) {
    rejected.push(`linkedin_url ${li.verdict}: ${li.reason}`)
  }

  const em = classifyEmail(incoming.email, source)
  // email_normalized is GENERATED ALWAYS from email; writing it is rejected by
  // the database, which is the right way round.
  if (em.verified && !cur.email_normalized) patch.email = em.verified
  if (em.guessed) rejected.push('email is a pattern guess; kept out of the sendable column')

  for (const f of ['company', 'title'] as const) {
    const v = bestOf({ value: cur[f], source: 'manual' }, { value: incoming[f], source })
    if (v && v !== cur[f]) patch[f] = v
  }

  return { patch, rejected }
}
