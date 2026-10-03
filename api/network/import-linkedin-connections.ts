import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { parseDelimited } from '../_csv.js'
import { readDriveText } from '../_driveFile.js'
import { slugOf } from './import-linkedin-messages.js'

// POST /api/network/import-linkedin-connections?fileId=...&dryRun=1
//
// Connections.csv from the same LinkedIn export: first name, last name, profile
// URL, company, position, and an email for the minority who allow it.
//
// It is run AFTER the message import to give those people a face. The message
// export names the person who wrote to Krish and nobody else, so 121 people he
// messaged who never replied arrived as a profile URL with no name at all, and
// the 269 contacts created from it have a name and nothing else. This fills in
// the title and company that make them findable, and the email where LinkedIn
// gives one, which is the only thing that can join a LinkedIn identity to a
// mail identity for the same human.
//
// It never creates a contact. A connection Krish has never spoken to is a
// follower count, not a relationship, and 4,000 of those would bury the people
// he actually talks to. Only rows that match a contact already present are
// touched, and a field already filled is left alone: this export is from
// February and the enrichment that wrote current_title is newer.

export const config = { maxDuration: 300 }

interface Row { slug: string; name: string; company: string | null; title: string | null; email: string | null }

export function parseConnections(rows: string[][]): Row[] {
  // LinkedIn puts a three-line notice above the header, so the header is found
  // rather than assumed to be row 0.
  const headAt = rows.findIndex(r => r.map(c => c.trim().toLowerCase()).includes('first name'))
  if (headAt < 0) return []
  const head = rows[headAt].map(h => h.trim().toLowerCase())
  const col = (n: string) => head.indexOf(n)
  const iFirst = col('first name'), iLast = col('last name'), iUrl = col('url')
  const iEmail = col('email address'), iCo = col('company'), iPos = col('position')
  if (iUrl < 0) return []

  const out: Row[] = []
  for (let i = headAt + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const slug = slugOf(r[iUrl])
    if (!slug) continue
    const name = [r[iFirst], r[iLast]].map(x => (x || '').trim()).filter(Boolean).join(' ')
    const clean = (v: string | undefined) => {
      const t = (v || '').trim()
      return t ? t.slice(0, 200) : null
    }
    out.push({ slug, name, company: clean(r[iCo]), title: clean(r[iPos]), email: clean(r[iEmail]) })
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return
  const fileId = (typeof req.query.fileId === 'string' && req.query.fileId)
    || process.env.LINKEDIN_CONNECTIONS_FILE_ID
  if (!fileId) return res.status(400).json({ ok: false, error: 'fileId is required' })
  const dryRun = req.query.dryRun === '1'

  try {
    const rows = parseConnections(parseDelimited(await readDriveText(fileId)))
    if (!rows.length) return res.status(422).json({ ok: false, error: 'no connection rows found in that file' })

    const bySlug = new Map(rows.map(r => [r.slug, r]))

    // Only contacts that already exist, and only the LinkedIn ones.
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, full_name, company, title, email, linkedin_url')
      .not('linkedin_url', 'is', null)
    if (error) throw new Error(error.message)

    const updates: Array<Record<string, unknown>> = []
    let named = 0, titled = 0, emailed = 0
    for (const c of (contacts || []) as Array<Record<string, unknown>>) {
      const s = slugOf(String(c.linkedin_url || ''))
      const r = s ? bySlug.get(s) : null
      if (!r) continue
      const patch: Record<string, unknown> = {}
      // A field already filled is left alone; this export is from February.
      if (!String(c.full_name || '').trim() && r.name) { patch.full_name = r.name; named++ }
      if (!String(c.company || '').trim() && r.company) patch.company = r.company
      if (!String(c.title || '').trim() && r.title) { patch.title = r.title; titled++ }
      if (!String(c.email || '').trim() && r.email) { patch.email = r.email; emailed++ }
      if (Object.keys(patch).length) updates.push({ id: c.id, ...patch })
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true, dryRun: true, connections: rows.length,
        would_update: updates.length, names: named, titles: titled, emails: emailed,
        sample: updates.slice(0, 5),
      })
    }

    let updated = 0
    for (const u of updates) {
      const { id, ...patch } = u
      const { error: uErr } = await supabase.from('contacts').update(patch).eq('id', id)
      if (uErr) return res.status(500).json({ ok: false, error: `update: ${uErr.message}`, updated })
      updated++
    }

    // An email arriving where there was none can join a LinkedIn identity to a
    // mail one, which changes what the rollup can see.
    const { data: rolled, error: rerr } = await supabase.rpc('refresh_relationship_rollup')
    return res.status(200).json({
      ok: true, connections: rows.length, updated, names: named, titles: titled, emails: emailed,
      contacts_rescored: rerr ? null : rolled, rollup_error: rerr?.message || null,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
  }
}
