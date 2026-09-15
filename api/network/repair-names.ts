import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { lookupName, splitName } from '../_gmailNames.js'

// POST /api/network/repair-names   { limit?, dry? }
//
// Repair contacts whose full_name is a first name and nothing else, using the
// From header of their own mail. See api/_gmailNames.ts for why this is worth
// doing before any enrichment vendor is paid: 1,882 records are currently
// unmatchable by any person API because they have no surname, and the surname
// was in the mailbox the whole time.
//
// Runs here rather than in a script because the Gmail credential is a
// domain-wide-delegated service account that only exists in the deployment
// environment. Same reason /api/network/enrich-person is a route.
//
// SAFETY: this only ever fills a gap. A contact whose name already contains a
// space is never touched, and a lookup that returns nothing leaves the record
// exactly as it was. There is no path here that overwrites a name a human set.

export const config = { maxDuration: 60 }

interface Body { limit?: number; dry?: boolean; after_id?: string }

interface Row { id: string; full_name: string; email: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const b = (req.body || {}) as Body
  // Capped at 200: each contact costs two Gmail calls, and the function dies at
  // 60s. A caller wanting the full 1,422 pages through with repeated calls.
  const limit = Math.min(Math.max(Number(b.limit) || 50, 1), 200)
  // Dry by default. Omitting the flag on a bulk write that touches real
  // people's names must not be the branch that writes — the same rule the
  // import scripts enforce with --commit.
  const dry = b.dry !== false

  // Ordered by id and paged with a cursor, NOT a bare limit.
  //
  // The first version had neither, and the bug it caused is worth recording: a
  // repaired row gains a space and drops out of this filter, so the window
  // "advances" only by however many were fixed. Once the leading rows were all
  // people with no mail on file — 184 of the first 200 — every subsequent run
  // re-read the same dead window, spent 400 Gmail calls, and returned zero. It
  // looked exactly like "the backlog is finished" while 1,167 candidates had
  // never been examined once.
  //
  // Ordering by id makes the sequence stable, and a cursor makes progress
  // independent of how many rows leave the set behind us.
  let q = supabase
    .from('contacts')
    .select('id, full_name, email')
    .not('email', 'is', null)
    .not('full_name', 'is', null)
    // PostgREST has no "contains a space" filter, so the cheap side is done here
    // and the exact test below. `like` with a space pattern is negatable.
    .not('full_name', 'like', '% %')
    .order('id', { ascending: true })
    .limit(limit)
  const after = (b.after_id || '').trim()
  if (after) q = q.gt('id', after)
  const { data, error } = await q
  if (error) return res.status(500).json({ ok: false, error: error.message })

  const rows = (data || []) as Row[]
  const repaired: { id: string; from: string; to: string }[] = []
  const skipped: Record<string, number> = { no_messages: 0, no_display_name: 0, error: 0 }

  for (const r of rows) {
    // Belt and braces: never touch a name that already has two parts.
    if (r.full_name.includes(' ')) continue
    const hit = await lookupName(r.email)
    if (!hit.name) { skipped[hit.reason || 'error'] = (skipped[hit.reason || 'error'] || 0) + 1; continue }

    repaired.push({ id: r.id, from: r.full_name, to: hit.name })
    if (dry) continue

    const { first, last } = splitName(hit.name)
    const { error: e } = await supabase
      .from('contacts')
      .update({ full_name: hit.name, first_name: first, last_name: last, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (e) return res.status(500).json({ ok: false, error: `write failed for ${r.id}: ${e.message}` })
  }

  return res.status(200).json({
    ok: true,
    dry,
    examined: rows.length,
    /** Pass back as `after_id` to continue. Null when the backlog is genuinely
     *  exhausted, which is a different fact from "this batch repaired none". */
    next_after_id: rows.length === limit ? rows[rows.length - 1].id : null,
    repaired: repaired.length,
    skipped,
    // Returned so a run can be eyeballed before the next batch. These are real
    // names of real people, so the route stays behind the same gate as the rest
    // of /api/network/*.
    sample: repaired.slice(0, 25),
  })
}
