import { googleAccessToken } from './_google.js'

// Recovering real names from your own mailbox.
//
// 1,882 contacts carry a first name and nothing else — "Bill", "James",
// "Chelsea", "Scottdmcarthur". They arrived from email addresses, where the
// local part was all anyone bothered to keep. That makes them worthless twice
// over: unreadable in the Network tab, and unmatchable by ANY enrichment
// vendor, because a person API needs a surname to resolve against.
//
// The names were never actually missing. Every message carries them in the
// From header — `From: James Harrabin <james@dothinkdo.com>` — and Krish has
// the mail. This turns dead records back into matchable people for zero
// external spend, which is why it runs before any vendor is paid a cent.
//
// The Gmail read is deliberately narrow: messages.list capped at one result,
// then messages.get with format=metadata and metadataHeaders=From. No bodies,
// no snippets, no attachments — one header per person. A full-message read
// would be ~10KB per contact for a string that is under 40 bytes.

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const READONLY = 'https://www.googleapis.com/auth/gmail.readonly'

/** RFC 2047 encoded-word, e.g. `=?UTF-8?B?SmFtZXM=?=`. Non-ASCII names arrive
 *  this way and would otherwise be written to the database as mojibake. */
function decodeEncodedWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset, enc, text) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8')
      }
      // Q encoding: underscores are spaces, =XX is a hex byte.
      const bytes = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) =>
        String.fromCharCode(parseInt(h, 16)))
      return Buffer.from(bytes, 'binary').toString('utf8')
    } catch { return whole }
  })
}

/** "Harrabin, James" → "James Harrabin". Corporate directories emit this shape
 *  and storing it verbatim sorts and reads wrong everywhere downstream. */
function unflip(name: string): string {
  const m = /^([^,]+),\s*(.+)$/.exec(name)
  if (!m) return name
  // Only flip when both halves look like name parts. "Smith, Jones & Partners
  // LLP" is a firm, not a person, and must survive untouched.
  const [, last, first] = m
  if (/\b(llp|ltd|inc|gmbh|llc|plc|group|partners)\b/i.test(name)) return name
  if (last.split(/\s+/).length > 3 || first.split(/\s+/).length > 3) return name
  return `${first.trim()} ${last.trim()}`
}

/**
 * Pull a usable human name out of a From header, or null.
 *
 * Null is the common and correct answer. A wrong name on a real person is
 * worse than no name: it is what gets typed into an opening line. So every
 * ambiguous case is rejected rather than guessed.
 */
export function nameFromHeader(header: string | null | undefined, email: string): string | null {
  if (!header) return null
  const decoded = decodeEncodedWords(header.trim())

  // `Name <addr>` — take the part before the angle bracket. A bare address with
  // no display name yields nothing, which is the honest outcome.
  const m = /^(.*?)<[^>]*>\s*$/.exec(decoded)
  let name = (m ? m[1] : '').trim().replace(/^["']|["']$/g, '').trim()
  if (!name) return null

  name = unflip(name).replace(/\s+/g, ' ').trim()

  // The display name is just the address again. Very common, and carries no
  // information the record does not already have.
  if (name.includes('@')) return null
  const local = email.split('@')[0].toLowerCase()
  const bare = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (bare === local.replace(/[^a-z0-9]/g, '')) return null

  // A single token is what we already have. "Bill" → "Bill" is not a repair,
  // and accepting it would mark the record fixed and stop it being retried.
  const tokens = name.split(' ').filter(Boolean)
  if (tokens.length < 2) return null

  // Role accounts and mailing lists wear person-shaped display names. None of
  // these is someone Krish met.
  if (/\b(team|support|noreply|no-reply|notifications?|info|hello|admin|billing|newsletter|via)\b/i.test(name)) return null

  // Sanity: a display name of five-plus words is a subject line or a signature
  // block that leaked into the header.
  if (tokens.length > 4) return null
  if (name.length > 60) return null

  return name
}

/** Split a resolved name for the first_name / last_name columns. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.split(/\s+/)
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export interface NameLookup {
  email: string
  name: string | null
  /** Why nothing came back, when nothing did. Kept so a run can be read as
   *  "no mail from them" vs "mail exists, header was useless" — those call for
   *  completely different next steps. */
  reason?: 'no_messages' | 'no_display_name' | 'error'
}

/**
 * One person, two small Gmail calls.
 *
 * Searched `from:` rather than `to:` deliberately: a From header is written by
 * the sender's own client and carries the name they call themselves. A To
 * header carries whatever Krish's client autocompleted, which is frequently the
 * same truncated first name this function exists to repair.
 */
export async function lookupName(email: string): Promise<NameLookup> {
  const token = await googleAccessToken([READONLY])
  if (!token) return { email, name: null, reason: 'error' }

  try {
    const list = await fetch(
      `${GMAIL}/messages?q=${encodeURIComponent(`from:${email}`)}&maxResults=1`,
      { headers: { authorization: `Bearer ${token}` } })
    if (!list.ok) return { email, name: null, reason: 'error' }
    const lj: any = await list.json()
    const id = lj?.messages?.[0]?.id
    if (!id) return { email, name: null, reason: 'no_messages' }

    const msg = await fetch(
      `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From`,
      { headers: { authorization: `Bearer ${token}` } })
    if (!msg.ok) return { email, name: null, reason: 'error' }
    const mj: any = await msg.json()
    const header = (mj?.payload?.headers || []).find((h: any) => h?.name?.toLowerCase() === 'from')?.value
    const name = nameFromHeader(header, email)
    return name ? { email, name } : { email, name: null, reason: 'no_display_name' }
  } catch {
    return { email, name: null, reason: 'error' }
  }
}
