import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble, pathId } from '../_content.js'
import { attachRejectSignal } from '../_rejectSignal.js'

// PATCH /api/content-decisions/:id
//   body: { action: 'done'|'dismiss'|'reject', note?, reason_code?, reason_text? }
//
// Generic resolver for the weekly queue (spec §5). Shift rulings go through
// /api/shifts/:id (which resolves its own card); this endpoint handles the
// rest. A graduation resolved with 'done' stamps the idea into the Library
// (library_at + horizon=evergreen) so the purge can never touch it (fate 3).
//
// 'dismiss' vs 'reject' is a real distinction, not a synonym pair:
//   dismiss = "not now" (deferred to the desktop sitting, let it purge). The
//             card clears and the engine learns nothing, because nothing was
//             actually judged.
//   reject  = "bin it, and here is why". Same terminal status, but it also
//             writes the −1 to feedback_queue that Vera's Sunday aggregation
//             clusters by reason_code, and a binned brief_review archives its
//             brief so This Week stops offering something Krish already refused.
// v1's triage deck captured this on every left-swipe; v2 dropped swipe-to-decide
// and the reason capture went with the gesture. This puts it back on the buttons.

/** Reasons live in src/lib/triageReasons.ts (REJECT_REASONS.content_decisions)
 *  and api/feedback.ts REASON_OPTIONS. Kept open here for the same reason
 *  /api/feedback keeps it open: an unknown code still teaches, as 'other'. */
const DEFAULT_REASON = 'content_other'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'PATCH, OPTIONS')) return
  if (req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'PATCH only' })
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as {
    action?: string; note?: string; reason_code?: string; reason_text?: string
  }
  if (!b.action || !['done', 'dismiss', 'reject'].includes(b.action)) {
    return res.status(400).json({ ok: false, error: 'action must be done, dismiss or reject' })
  }

  const { data: decision, error } = await supabase.from('content_decisions').select('*').eq('id', id).single()
  if (error || !decision) return res.status(404).json({ ok: false, error: 'decision not found' })
  if (decision.status !== 'pending') return res.status(409).json({ ok: false, error: `already ${decision.status}` })

  const nowIso = new Date().toISOString()
  const rejecting = b.action === 'reject'
  const reasonCode = rejecting ? (b.reason_code || DEFAULT_REASON) : null
  const reasonText = (b.reason_text || '').trim() || null
  const resolution = {
    action: b.action,
    at: nowIso,
    note: b.note || null,
    ...(rejecting ? { reason_code: reasonCode, reason_text: reasonText } : {}),
  }

  if (decision.kind === 'graduation' && b.action === 'done' && decision.ref) {
    await supabase.from('content_ideas')
      .update({ library_at: nowIso, horizon: 'evergreen', expires_at: null })
      .eq('id', decision.ref)
  }

  const { error: upErr } = await supabase.from('content_decisions')
    .update({ status: b.action === 'done' ? 'done' : 'dismissed', resolved_at: nowIso, resolution })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  // Everything below is the learning half of a reject. Best-effort by design:
  // the ruling itself is already committed, so a failure here must not tell
  // Krish his tap did nothing. It is reported, not thrown.
  let taught = false
  let archived = false
  if (rejecting) {
    const p = (decision.payload || {}) as Record<string, any>
    const cardTitle = String(p.title || p.anchor_headline || '')
    const cardText = [p.summary, p.thesis, p.why].filter(v => typeof v === 'string' && v.trim()).join('\n')

    const { data: fbRow, error: fbErr } = await supabase.from('feedback_queue').insert({
      source_table: 'content_decisions',
      source_id: decision.id,
      agent_id: 'cleo',
      original_agent: 'cleo',
      original_item_id: decision.id,
      vote: -1,
      reason_code: reasonCode,
      reason_text: reasonText,
      meta: { kind: decision.kind, ref: decision.ref, week: decision.week, surface: 'content_v2_week' },
      status: 'pending',
    }).select('id').single()
    taught = !fbErr

    // Keep what was refused, not just that it was. Survives the purge that
    // deletes the underlying item, and is what the predictor searches.
    await attachRejectSignal(fbRow?.id, cardTitle, cardText)

    // A binned brief must leave This Week. Without this the hero card keeps
    // offering the brief that was just refused, which reads as the bin failing.
    if (decision.kind === 'brief_review' && decision.ref) {
      const { error: brErr } = await supabase.from('weekly_briefs')
        .update({ status: 'archived', updated_at: nowIso })
        .eq('id', decision.ref)
        .in('status', ['ready', 'in_review', 'approved'])
      archived = !brErr
    }
  }

  return res.json({ ok: true, kind: decision.kind, action: b.action, reason_code: reasonCode, taught, archived })
}
