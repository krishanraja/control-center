import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { parseDelimited } from '../_csv.js'
import { readDriveText } from '../_driveFile.js'

// POST /api/network/import-linkedin-messages?fileId=...&dryRun=1
//
// Reads messages.csv from a LinkedIn data export held in Krish's Drive and
// turns it into counts: who he has messaged, who answered, when it started and
// when it last happened. It is the only source that sees the third of his
// network with a LinkedIn profile and no email address.
//
// What it keeps: the other person's profile URL and name, a direction, and
// dates. What it never keeps: CONTENT or SUBJECT. Both columns are read past
// without being assigned, the same promise the mail sync makes in
// api/_mailHeaders.ts, and tests/api/linkedinMessages.test.ts holds it.
//
// Drive is read by impersonating the file's owner, so the export can stay
// where it already is rather than being copied somewhere the app owns.

export const config = { maxDuration: 300 }

/** Krish, as LinkedIn writes him in the FROM column of his own export. */
const SELF_SLUG = 'krish-raja'

interface Tally {
  linkedin_url: string
  display_name?: string
  inbound_count: number
  outbound_count: number
  first_at?: string
  last_at?: string
  last_inbound_at?: string
  last_outbound_at?: string
}

const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b)
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b)

/** The identifying part of a profile URL, matching public.linkedin_slug(). */
export function slugOf(url: string | undefined): string | null {
  const m = /linkedin\.com\/(?:in|pub)\/([^/?#]+)/i.exec(url || '')
  return m ? m[1].trim().toLowerCase() : null
}

/** "2026-02-20 15:49:04 UTC" into an ISO timestamp. */
export function parseExportDate(s: string | undefined): string | undefined {
  const t = (s || '').trim()
  if (!t) return undefined
  const d = new Date(t.replace(' UTC', 'Z').replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Turn the export's rows into one tally per counterpart.
 *
 *  A row is outbound when the sender is Krish. Group messages name several
 *  recipients; each is credited, because a message to three people is still a
 *  message to each of them. */
export function tallyMessages(rows: string[][]): Map<string, Tally> {
  const out = new Map<string, Tally>()
  if (!rows.length) return out
  const head = rows[0].map(h => h.trim().toUpperCase())
  const col = (name: string) => head.indexOf(name)
  const iFrom = col('SENDER PROFILE URL')
  const iTo = col('RECIPIENT PROFILE URLS')
  const iFromName = col('FROM')
  const iToName = col('TO')
  const iDate = col('DATE')
  const iDraft = col('IS MESSAGE DRAFT')
  if (iFrom < 0 || iTo < 0 || iDate < 0) return out

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length < head.length - 2) continue
    // A draft was never sent, so it is not contact.
    if (iDraft >= 0 && /^yes$/i.test((row[iDraft] || '').trim())) continue
    const at = parseExportDate(row[iDate])
    if (!at) continue

    const fromSlug = slugOf(row[iFrom])
    const outbound = fromSlug === SELF_SLUG
    // LinkedIn separates several recipients with a space.
    const toUrls = (row[iTo] || '').split(/\s+/).filter(Boolean)
    const counterparts = outbound
      ? toUrls.map(u => ({ slug: slugOf(u), url: u, name: row[iToName] }))
      : [{ slug: fromSlug, url: (row[iFrom] || '').trim(), name: row[iFromName] }]

    for (const c of counterparts) {
      if (!c.slug || c.slug === SELF_SLUG) continue
      const t = out.get(c.slug) || {
        linkedin_url: `https://www.linkedin.com/in/${c.slug}`,
        inbound_count: 0, outbound_count: 0,
      }
      // A name is only trustworthy for the person who wrote the message: the
      // TO column holds one name even when a thread has several recipients.
      if (!outbound && c.name && c.name.trim()) t.display_name = c.name.trim()
      if (outbound) { t.outbound_count++; t.last_outbound_at = later(t.last_outbound_at, at) }
      else { t.inbound_count++; t.last_inbound_at = later(t.last_inbound_at, at) }
      t.first_at = earlier(t.first_at, at)
      t.last_at = later(t.last_at, at)
      out.set(c.slug, t)
    }
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return
  const fileId = (typeof req.query.fileId === 'string' && req.query.fileId)
    || process.env.LINKEDIN_MESSAGES_FILE_ID
  if (!fileId) return res.status(400).json({ ok: false, error: 'fileId is required' })
  const dryRun = req.query.dryRun === '1'

  let text: string
  try { text = await readDriveText(fileId) }
  catch (e) { return res.status(502).json({ ok: false, error: String((e as Error)?.message || e).slice(0, 300) }) }

  const tallies = tallyMessages(parseDelimited(text))
  const rows = [...tallies.values()].map(t => ({
    linkedin_url: t.linkedin_url,
    channel: 'linkedin_message',
    account: 'linkedin',
    display_name: t.display_name ?? null,
    first_at: t.first_at ?? null,
    last_at: t.last_at ?? null,
    last_inbound_at: t.last_inbound_at ?? null,
    last_outbound_at: t.last_outbound_at ?? null,
    inbound_count: t.inbound_count,
    outbound_count: t.outbound_count,
    meeting_count: 0,
  }))

  const twoWay = rows.filter(x => x.inbound_count > 0 && x.outbound_count > 0).length
  if (dryRun) {
    return res.status(200).json({ ok: true, dryRun: true, people: rows.length, twoWay, sample: rows.slice(0, 5) })
  }

  // The merge adds to what is there, so a second run of the same export would
  // double every count. Clearing this channel first makes the import repeatable.
  const { error: delErr } = await supabase.from('correspondent_stats')
    .delete().eq('channel', 'linkedin_message').eq('account', 'linkedin')
  if (delErr) return res.status(500).json({ ok: false, error: `clear: ${delErr.message}` })

  let merged = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase.rpc('merge_correspondent_stats', { p_rows: rows.slice(i, i + 500) })
    if (error) return res.status(500).json({ ok: false, error: `merge: ${error.message}`, merged })
    merged += Number(data) || 0
  }

  const { data: rolled, error: rerr } = await supabase.rpc('refresh_relationship_rollup')
  return res.status(200).json({
    ok: true,
    people: rows.length,
    twoWay,
    merged,
    contacts_updated: rerr ? null : rolled,
    rollup_error: rerr?.message || null,
  })
}
