import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble } from '../_content.js'
import { guard } from '../_auth.js'
import { text, bodyId } from '../_growth.js'
import { CLEARED_OLD_WEEK } from '../../src/lib/growthWire.js'

// /api/growth/council: the weekly growth council reviews.
//
//   GET    reviews, newest week first.
//   PATCH  { id, krish_decision }   record Krish's ruling into krish_decision
//          and stamp decided_at. Clearing the decision (empty string) also
//          clears decided_at, so the "decided" badge can never outlive the
//          decision text.
//   PATCH  { action: 'clear_old' }  every review still unruled in a week older
//          than the newest week_start gets krish_decision CLEARED_OLD_WEEK
//          ('Cleared: an older week') and decided_at now, in one statement.
//          Returns { cleared, latest_week }. The newest week is never touched,
//          and neither is any review that already carries a ruling.
//
// What "ruled" means downstream, so nothing here promises more: council-run
// skips a product whose row for the week it is writing is already ruled. The
// cron writes only the week that is ending, so a cleared week is never in its
// way; a manual re-run of an older week (POST { week_start }) leaves its
// cleared rows as they are. Ask Marcus and the tab grounding read the newest
// rows as context, which clearing never touches. No agent acts on a ruling.
// Clearing therefore only stops 35 stale reports asking for a ruling one by
// one; the text says they were cleared, not judged.
//
// Reviews themselves are written by the council workflow with the service role.
// This route only carries the human ruling. Writes need the dashboard cookie
// (the same gate as /api/growth/creative), because a bulk write should not be
// one unauthenticated request away.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH' && guard(req, res, ['PATCH'])) return
  if (preamble(req, res, 'GET, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('growth_council_reviews')
      .select('*')
      .order('week_start', { ascending: false })
      .order('product_slug', { ascending: true })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, count: (data || []).length, reviews: data || [] })
  }

  // PATCH
  const b = (req.body || {}) as Record<string, unknown>

  if (b.action === 'clear_old') {
    const { data: newest, error: readErr } = await supabase
      .from('growth_council_reviews')
      .select('week_start')
      .order('week_start', { ascending: false })
      .limit(1)
    if (readErr) return res.status(500).json({ ok: false, error: readErr.message })
    const latest = (newest?.[0] as { week_start?: string } | undefined)?.week_start ?? null
    if (!latest) return res.json({ ok: true, cleared: 0, latest_week: null })
    // If a new week lands between the read and this write, `latest` is one
    // week behind and the week it names is left alone: the safe direction.
    const { data, error } = await supabase
      .from('growth_council_reviews')
      .update({ krish_decision: CLEARED_OLD_WEEK, decided_at: new Date().toISOString() })
      .is('krish_decision', null)
      .lt('week_start', latest)
      .select('id')
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, cleared: (data || []).length, latest_week: latest })
  }
  if (b.action != null) return res.status(400).json({ ok: false, error: "action must be 'clear_old'" })

  const id = bodyId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  if (!('krish_decision' in b)) return res.status(400).json({ ok: false, error: 'krish_decision required' })
  const decision = text(b.krish_decision)

  const { data, error } = await supabase
    .from('growth_council_reviews')
    .update({ krish_decision: decision, decided_at: decision ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'review not found' })
  return res.json({ ok: true, review: data })
}
