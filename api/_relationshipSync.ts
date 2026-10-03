// Relationship sync: how close Krish is to each person, read from his own
// mail and calendars and kept current.
//
// Three Google accounts (2026-10-03):
//   krish@mindmake.co      Workspace; the existing service account impersonates
//                          it by domain-wide delegation ('delegated')
//   hello@krishraja.com    a separate account; one-time sign-in ('oauth')
//   krishanraja@gmail.com  consumer; one-time sign-in ('oauth')
//
// PRIVACY, and it is the reason this file is shaped the way it is: messages are
// fetched with format=metadata and exactly the headers in MAIL_HEADERS. No body,
// no subject, no snippet is ever requested, so none can be stored. What leaves
// here is counts and dates per counterpart address.
//
// It works forward through time in windows and saves its position after each
// one, so a single call fits inside a 60s function and the same code does both
// the multi-year backfill (called repeatedly) and the daily top-up (one call).

import { supabase } from './_supabase.js'
import { googleAccessToken } from './_google.js'
import { SELF, MAIL_HEADERS, parseAddresses, isAutomated } from './_mailHeaders.js'

export { SELF }

export const MAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

interface Account {
  email: string
  auth_kind: 'delegated' | 'oauth'
  refresh_token: string | null
  mail_cursor: string | null
  calendar_cursor: string | null
}

interface Tally {
  display_name?: string
  first_at?: string
  last_at?: string
  last_inbound_at?: string
  last_outbound_at?: string
  inbound_count: number
  outbound_count: number
  meeting_count: number
}

const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b)
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b)

async function oauthToken(refresh: string): Promise<string | null> {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!id || !secret) return null
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const j: any = await r.json().catch(() => ({}))
  return r.ok && j.access_token ? j.access_token : null
}

async function tokenFor(a: Account, scope: string, onError: (e: string) => void): Promise<string | null> {
  if (a.auth_kind === 'oauth') {
    if (!a.refresh_token) { onError('no refresh token: connect the account again'); return null }
    return oauthToken(a.refresh_token)
  }
  return googleAccessToken([scope], { subject: a.email, onError })
}

async function gget(url: string, token: string): Promise<any> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 429) throw new Error('rate_limited')
  if (!r.ok) throw new Error(`google ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

/** Count one window of mail [from, to). Returns tallies keyed by address. */
async function tallyMailWindow(token: string, fromIso: string, toIso: string, tallies: Map<string, Tally>): Promise<number> {
  const after = Math.floor(Date.parse(fromIso) / 1000)
  const before = Math.floor(Date.parse(toIso) / 1000)
  const ids: string[] = []
  let page: string | undefined
  do {
    const q = encodeURIComponent(`after:${after} before:${before} -in:chats -in:spam -in:trash`)
    const j = await gget(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=500${page ? `&pageToken=${page}` : ''}`, token)
    for (const m of j.messages || []) ids.push(m.id)
    page = j.nextPageToken
  } while (page && ids.length < 5000)

  const hdrQs = MAIL_HEADERS.map(h => `metadataHeaders=${encodeURIComponent(h)}`).join('&')
  await mapLimit(ids, 10, async id => {
    let m: any
    try {
      m = await gget(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&${hdrQs}`, token)
    } catch { return }
    const h: Record<string, string> = {}
    for (const x of m.payload?.headers || []) h[String(x.name).toLowerCase()] = String(x.value)
    if (h['list-unsubscribe'] || /bulk|list|junk/i.test(h['precedence'] || '') || (h['auto-submitted'] && h['auto-submitted'] !== 'no')) return
    const at = new Date(Number(m.internalDate)).toISOString()
    const from = parseAddresses(h['from'])[0]
    if (!from) return
    const outbound = SELF.has(from.email)
    const counterparts = outbound
      ? [...parseAddresses(h['to']), ...parseAddresses(h['cc'])]
      : [from]
    for (const c of counterparts) {
      if (SELF.has(c.email) || isAutomated(c.email)) continue
      const t = tallies.get(c.email) || { inbound_count: 0, outbound_count: 0, meeting_count: 0 }
      if (!outbound && c.name) t.display_name = c.name
      if (outbound) { t.outbound_count++; t.last_outbound_at = later(t.last_outbound_at, at) }
      else { t.inbound_count++; t.last_inbound_at = later(t.last_inbound_at, at) }
      t.first_at = earlier(t.first_at, at)
      t.last_at = later(t.last_at, at)
      tallies.set(c.email, t)
    }
  })
  return ids.length
}

/** Count meetings in [from, to): events Krish did not decline, with other
 *  human attendees, that have already started. */
async function tallyCalendarWindow(token: string, fromIso: string, toIso: string, tallies: Map<string, Tally>): Promise<number> {
  let page: string | undefined
  let n = 0
  const now = new Date().toISOString()
  do {
    const u = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=2500`
      + `&timeMin=${encodeURIComponent(fromIso)}&timeMax=${encodeURIComponent(toIso < now ? toIso : now)}`
      + (page ? `&pageToken=${page}` : '')
    const j = await gget(u, token)
    for (const ev of j.items || []) {
      const people = (ev.attendees || []) as any[]
      if (people.length < 2 || people.length > 25) continue // solo blocks and all-hands say nothing
      const me = people.find(p => p.self || SELF.has(String(p.email || '').toLowerCase()))
      if (me && me.responseStatus === 'declined') continue
      const at = ev.start?.dateTime || ev.start?.date
      if (!at) continue
      n++
      const iso = new Date(at).toISOString()
      for (const p of people) {
        const email = String(p.email || '').toLowerCase()
        if (!email || p.self || p.resource || SELF.has(email) || isAutomated(email)) continue
        const t = tallies.get(email) || { inbound_count: 0, outbound_count: 0, meeting_count: 0 }
        if (p.displayName) t.display_name = p.displayName
        t.meeting_count++
        t.first_at = earlier(t.first_at, iso)
        t.last_at = later(t.last_at, iso)
        tallies.set(email, t)
      }
    }
    page = j.nextPageToken
  } while (page)
  return n
}

async function merge(channel: string, account: string, tallies: Map<string, Tally>): Promise<void> {
  const rows = [...tallies.entries()].map(([email, t]) => ({ email_normalized: email, channel, account, ...t }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.rpc('merge_correspondent_stats', { p_rows: rows.slice(i, i + 500) })
    if (error) throw new Error(`merge: ${error.message}`)
  }
}

export interface SyncResult {
  account: string
  mail?: { from: string; to: string; messages: number; people: number }
  calendar?: { from: string; to: string; events: number; people: number }
  caughtUp: boolean
  error?: string
}

/** Advance one account by up to `budgetMs`, window by window. */
export async function syncAccount(email: string, opts: { budgetMs?: number; windowDays?: number; startIso?: string } = {}): Promise<SyncResult> {
  const t0 = Date.now()
  const budget = opts.budgetMs ?? 45_000
  const windowMs = (opts.windowDays ?? 14) * 86_400_000
  const { data, error } = await supabase.from('google_accounts').select('*').eq('email', email).maybeSingle()
  if (error || !data) return { account: email, caughtUp: false, error: error?.message || 'account not connected' }
  const a = data as Account
  let lastErr = ''
  const onError = (e: string) => { lastErr = e }
  const start = opts.startIso || new Date(Date.now() - 3 * 365 * 86_400_000).toISOString()
  const res: SyncResult = { account: email, caughtUp: true }

  // Mail
  const mailToken = await tokenFor(a, MAIL_SCOPE, onError)
  if (mailToken) {
    let cursor = a.mail_cursor || start
    const from0 = cursor
    let messages = 0
    const tallies = new Map<string, Tally>()
    while (Date.now() - t0 < budget * 0.7 && cursor < new Date().toISOString()) {
      const to = new Date(Math.min(Date.parse(cursor) + windowMs, Date.now())).toISOString()
      messages += await tallyMailWindow(mailToken, cursor, to, tallies)
      cursor = to
    }
    await merge('email', email, tallies)
    await supabase.from('google_accounts').update({ mail_cursor: cursor }).eq('email', email)
    res.mail = { from: from0, to: cursor, messages, people: tallies.size }
    if (Date.parse(cursor) < Date.now() - 3_600_000) res.caughtUp = false
  } else res.error = `mail: ${lastErr || 'no token'}`

  // Calendar
  const calToken = await tokenFor(a, CALENDAR_SCOPE, onError)
  if (calToken) {
    let cursor = a.calendar_cursor || start
    const from0 = cursor
    let events = 0
    const tallies = new Map<string, Tally>()
    while (Date.now() - t0 < budget && cursor < new Date().toISOString()) {
      const to = new Date(Math.min(Date.parse(cursor) + windowMs * 8, Date.now())).toISOString()
      events += await tallyCalendarWindow(calToken, cursor, to, tallies)
      cursor = to
    }
    await merge('calendar', email, tallies)
    await supabase.from('google_accounts').update({ calendar_cursor: cursor }).eq('email', email)
    res.calendar = { from: from0, to: cursor, events, people: tallies.size }
    if (Date.parse(cursor) < Date.now() - 3_600_000) res.caughtUp = false
  } else res.error = [res.error, `calendar: ${lastErr || 'no token'}`].filter(Boolean).join('; ')

  await supabase.from('google_accounts').update({ last_sync_at: new Date().toISOString(), last_error: res.error || null }).eq('email', email)
  return res
}
