import { supabase } from './_supabase.js'

// What the record can prove about a relationship, for a set of contacts.
//
// Until 2026-10-03 the only relationship fact any prompt could see was
// `reciprocated_email`, a boolean. Everything else the sync had measured, how
// often they write, who wrote last, how long since, how many times they have
// actually been in a room, and which channel the relationship really lives on,
// sat in correspondent_stats and was never read by anything that talks to
// Krish. So "reach out to them" was the best a model could say about a person
// he has met fifteen times.
//
// This is the one reader of that evidence. It returns plain, already-decided
// facts rather than raw rows: a prompt should not be left to work out that 847
// days is "a long time" or that 40 LinkedIn messages and no email means write
// on LinkedIn.

export interface RelationshipEvidence {
  /** Where the relationship actually happens, by volume. */
  home_channel: 'email' | 'linkedin' | 'meetings' | null
  /** True only where both sides have written, on any channel. */
  two_way: boolean
  messages_from_them: number
  messages_from_krish: number
  meetings: number
  /** Days since anything at all, the number a human would quote. */
  days_since_contact: number | null
  /** Days since they were in a room or a call together. */
  days_since_meeting: number | null
  /** Who spoke last. 'them' means Krish owes a reply. */
  last_word: 'them' | 'krish' | null
  /** How long they have known each other, in months. */
  known_months: number | null
  /** The warmth is measured from evidence, not guessed at import. */
  warmth_measured: boolean
  warmth: number | null
  /** One sentence a prompt can quote without doing arithmetic. */
  summary: string
}

interface StatRow {
  channel: string
  inbound_count: number
  outbound_count: number
  meeting_count: number
  first_at: string | null
  last_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
}

const DAY = 86_400_000
const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / DAY)) : null
}

/** "three weeks", "eight months", "two years" — never "21 days ago". */
export function inWords(days: number | null): string | null {
  if (days === null) return null
  if (days <= 1) return 'today'
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  if (days < 540) return `${Math.round(days / 30)} months`
  const y = days / 365
  return y < 2.5 ? 'about two years' : `${Math.round(y)} years`
}

function describe(e: Omit<RelationshipEvidence, 'summary'>): string {
  if (!e.home_channel && !e.meetings) return 'No contact on record.'
  const bits: string[] = []
  if (e.two_way) {
    const total = e.messages_from_them + e.messages_from_krish
    bits.push(`${total} messages both ways on ${e.home_channel === 'linkedin' ? 'LinkedIn' : 'email'}`)
  } else if (e.messages_from_krish > 0 && e.messages_from_them === 0) {
    bits.push(`Krish has written ${e.messages_from_krish} times and never had a reply`)
  } else if (e.messages_from_them > 0) {
    bits.push(`${e.messages_from_them} messages from them, none back`)
  }
  if (e.meetings > 0) {
    const when = inWords(e.days_since_meeting)
    bits.push(`${e.meetings} ${e.meetings === 1 ? 'meeting' : 'meetings'}${when ? `, last ${when} ago` : ''}`)
  }
  const since = inWords(e.days_since_contact)
  if (since) bits.push(since === 'today' ? 'in touch today' : `quiet for ${since}`)
  if (e.last_word === 'them') bits.push('they wrote last, so a reply is owed')
  if (e.known_months && e.known_months >= 12) {
    const years = Math.round(e.known_months / 12)
    bits.push(years === 1 ? 'known for about a year' : `known for ${years} years`)
  }
  return bits.join('; ') + '.'
}

/** Read the evidence for up to a few dozen contacts in one round trip. */
export async function relationshipEvidence(contactIds: string[]): Promise<Map<string, RelationshipEvidence>> {
  const out = new Map<string, RelationshipEvidence>()
  const ids = contactIds.filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) return out

  // correspondent_stats is keyed by person, not by contact, so the join back to
  // a contact goes through email or LinkedIn slug exactly as the rollup does.
  const { data: contacts, error: cErr } = await supabase
    .from('contacts')
    .select('id, email_normalized, linkedin_url')
    .in('id', ids)
  if (cErr) throw new Error(cErr.message)

  const { data: intel, error: iErr } = await supabase
    .from('contact_intelligence')
    .select('contact_id, warmth, warmth_source')
    .in('contact_id', ids)
  if (iErr) throw new Error(iErr.message)
  const warmthBy = new Map((intel || []).map((r: Record<string, unknown>) => [String(r.contact_id), r]))

  const slugOf = (url: unknown): string | null => {
    const m = /linkedin\.com\/(?:in|pub)\/([^/?#]+)/i.exec(String(url || ''))
    return m ? m[1].trim().toLowerCase() : null
  }

  const keys: string[] = []
  const keyToContacts = new Map<string, string[]>()
  for (const c of (contacts || []) as Array<Record<string, unknown>>) {
    const id = String(c.id)
    const ks: string[] = []
    if (c.email_normalized) ks.push(String(c.email_normalized).toLowerCase())
    const s = slugOf(c.linkedin_url)
    if (s) ks.push(`li:${s}`)
    for (const k of ks) {
      keys.push(k)
      keyToContacts.set(k, [...(keyToContacts.get(k) || []), id])
    }
  }
  if (!keys.length) return out

  const { data: stats, error: sErr } = await supabase
    .from('correspondent_stats')
    .select('person_key, channel, inbound_count, outbound_count, meeting_count, first_at, last_at, last_inbound_at, last_outbound_at')
    .in('person_key', keys)
  if (sErr) throw new Error(sErr.message)

  const byContact = new Map<string, StatRow[]>()
  for (const row of (stats || []) as Array<Record<string, unknown>>) {
    for (const id of keyToContacts.get(String(row.person_key)) || []) {
      byContact.set(id, [...(byContact.get(id) || []), row as unknown as StatRow])
    }
  }

  for (const id of ids) {
    const rows = byContact.get(id) || []
    const sum = (f: (r: StatRow) => number, where?: (r: StatRow) => boolean) =>
      rows.filter(r => !where || where(r)).reduce((n, r) => n + (Number(f(r)) || 0), 0)
    const maxOf = (f: (r: StatRow) => string | null) =>
      rows.map(f).filter(Boolean).sort().pop() || null
    const minOf = (f: (r: StatRow) => string | null) =>
      rows.map(f).filter(Boolean).sort().shift() || null

    const mail = (r: StatRow) => r.channel === 'email'
    const li = (r: StatRow) => r.channel === 'linkedin_message'
    const met = (r: StatRow) => r.channel === 'calendar' || r.channel === 'meeting_note'

    const mailCount = sum(r => r.inbound_count + r.outbound_count, mail)
    const liCount = sum(r => r.inbound_count + r.outbound_count, li)
    const meetings = sum(r => r.meeting_count, met)
    const inbound = sum(r => r.inbound_count)
    const outbound = sum(r => r.outbound_count)

    const lastIn = maxOf(r => r.last_inbound_at)
    const lastOut = maxOf(r => r.last_outbound_at)
    const firstAt = minOf(r => r.first_at)
    const w = warmthBy.get(id) || {}

    const base = {
      home_channel: (mailCount === 0 && liCount === 0
        ? (meetings > 0 ? 'meetings' : null)
        : liCount > mailCount ? 'linkedin' : 'email') as RelationshipEvidence['home_channel'],
      two_way: inbound > 0 && outbound > 0,
      messages_from_them: inbound,
      messages_from_krish: outbound,
      meetings,
      days_since_contact: daysSince(maxOf(r => r.last_at)),
      days_since_meeting: daysSince(maxOf(r => (met(r) ? r.last_at : null))),
      last_word: (lastIn && (!lastOut || lastIn > lastOut) ? 'them'
        : lastOut ? 'krish' : null) as RelationshipEvidence['last_word'],
      known_months: firstAt ? Math.round((Date.now() - Date.parse(firstAt)) / (30 * DAY)) : null,
      warmth_measured: w.warmth_source === 'measured',
      warmth: w.warmth === null || w.warmth === undefined ? null : Number(w.warmth),
    }
    out.set(id, { ...base, summary: describe(base) })
  }
  return out
}
