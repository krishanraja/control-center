import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { loadEvidence, loadPendingPromotions, proposeLadderMoves, writeLadderProposals, REVIEW_AGENT } from '../_autonomy.js'

// The weekly autonomy review (ADR-030, phase 4).
//
// Sunday 15:50 UTC, before the council run at 17:00. Reads autonomy_evidence
// and, for each surface whose numbers clear the ladder's own thresholds,
// writes ONE proposal on the autonomy_promotion surface: propose to assist on
// enough clean accepts, assist back to propose when the rate falls below the
// line it was promoted on. A surface with a proposal still waiting on Krish
// gets nothing new. Nothing here moves a rung: that is his verdict, in OS >
// Org, applied by /api/suggestions/verdict within the surface's max_rung.
//
// There is no code path from here to the word autonomous.
//
//   GET (CRON_SECRET)   POST (manual, through the edge gate)

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  try {
    const { evidence, labels } = await loadEvidence()
    const pending = await loadPendingPromotions(undefined, labels)
    const moves = proposeLadderMoves(evidence, new Set(pending.map(p => p.surface)), labels)
    if (!moves.length) {
      return res.json({ ok: true, proposed: 0, pending: pending.length, surfaces: evidence.length })
    }
    const w = await writeLadderProposals(moves)
    if (w.ok === false) return res.status(500).json({ ok: false, error: w.reason })
    try {
      await supabase.from('audit_log').insert({
        id: `autonomy_review-${Date.now()}`,
        event_type: 'autonomy_review',
        actor: REVIEW_AGENT,
        target: moves.map(m => `${m.surface}:${m.from}>${m.to}`).join(','),
      })
    } catch {
      // The audit line never fails the review.
    }
    return res.json({ ok: true, proposed: moves.length, ids: w.ids, moves, pending: pending.length, surfaces: evidence.length })
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'review_failed' })
  }
}
