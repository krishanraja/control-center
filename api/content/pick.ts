import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guard } from '../_auth.js'
import { planPick, planRestore, type PickPlan, type PickPrevious, type PickRow } from '../../src/lib/contentPick.js'

// POST /api/content/pick: pick a piece for a series, or undo a pick.
//
//   { action: 'pick', id, series }
//       The piece goes to drafting with lane_slot = series, and is protected
//       from the Monday clear-out because Krish chose it. Answers with what
//       the row held before, so the phone's Undo can put it back.
//   { action: 'restore', id, series, previous }
//       Puts state, lane_slot and protected_at back to `previous`, only while
//       the piece still sits exactly where the pick put it.
//
// WHY THIS IS HERE AND NOT IN THE ENGINE. The engine's PATCH
// /api/content-ideas is the choke point for state moves, and it accepts state
// but not lane_slot (content-engine apps/control-plane/api/content-ideas.ts).
// A pick has to set both. The engine reads lane_slot as the series for
// drafting, the fact gate and the publish checks, and its judge ladder only
// fills lane_slot when it is empty, so a stored pick is never overwritten.
// api/triage/promote.ts already moves content_ideas state from here on the
// same service key behind the same cookie gate.
//
// What it may write is decided by src/lib/contentPick.ts (planPick,
// planRestore), which the tests hold. Whether a series publishes is read from
// venture_formats at request time, never from a copy of the list.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = 'id,state,lane_slot,buried_at,protected_at,updated_at'

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function previousOf(v: unknown): PickPrevious | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (typeof r.state !== 'string') return null
  return {
    state: r.state,
    lane_slot: typeof r.lane_slot === 'string' && r.lane_slot ? r.lane_slot : null,
    protected_at: typeof r.protected_at === 'string' && r.protected_at ? r.protected_at : null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  const b = (req.body || {}) as Record<string, unknown>
  const action = b.action === 'restore' ? 'restore' : b.action === 'pick' || b.action === undefined ? 'pick' : null
  const id = text(b.id)
  const series = text(b.series)
  if (!action) return res.status(400).json({ ok: false, error: 'action must be pick or restore' })
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'id must be a piece id' })
  if (!series) return res.status(400).json({ ok: false, error: 'series is required' })

  const read = await supabase.from('content_ideas').select(COLUMNS).eq('id', id).maybeSingle()
  if (read.error) return res.status(500).json({ ok: false, error: read.error.message })
  const row = (read.data as PickRow | null) ?? null

  let plan: PickPlan
  if (action === 'pick') {
    const fmt = await supabase.from('venture_formats').select('slug,kind,active').eq('slug', series).maybeSingle()
    if (fmt.error) return res.status(500).json({ ok: false, error: fmt.error.message })
    const f = fmt.data as { kind?: string | null; active?: boolean | null } | null
    const live = Boolean(f && f.kind === 'subchannel' && f.active !== false)
    plan = planPick(row, series, live, new Date().toISOString())
  } else {
    plan = planRestore(row, series, previousOf(b.previous))
  }
  if (plan.ok === false) return res.status(plan.status).json({ ok: false, reason: plan.reason, error: plan.error })

  // Guarded on updated_at, like the engine's own PATCH: a write that lands
  // between the read and this update makes it a no-op, never a silent
  // overwrite of whatever the engine just did.
  const write = await supabase
    .from('content_ideas')
    .update(plan.update)
    .eq('id', id)
    .eq('updated_at', row!.updated_at)
    .select(COLUMNS)
  if (write.error) return res.status(500).json({ ok: false, error: write.error.message })
  if (!write.data || write.data.length !== 1) {
    return res.status(409).json({ ok: false, reason: 'changed_retry', error: 'The piece changed while this was saving. Try again.' })
  }
  return res.json({ ok: true, action, idea: write.data[0], previous: plan.previous })
}
