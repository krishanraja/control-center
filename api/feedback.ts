import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

// PR 3 of os-rebuild: thumbs-up/down feedback endpoint.
//
// POST /api/feedback
//   body: { source_table, source_id, agent_id?, vote: 1 | -1, reason_code?, reason_text?, meta? }
//
// Writes to feedback_queue. Vera's weekly audit (PR 5 cron) consumes
// unconsumed rows where vote=-1 with the same (agent_id, source_table, reason_code)
// and proposes a corrections row when count >= 3 (or >= 2 when a recognized
// reason_code is set). Grouping by reason_code is what keeps the three Marcus
// altitudes distinct: daily, milestone, and objective.
//
// `meta` is optional structured context. For marcus_priority_override
// (Phase 0 of the focus brief) the swap UI on Home posts an override of
// one of Marcus's top_three picks and packs the original pick + Krish's
// replacement into meta so Vera's aggregation has the full pattern.

const ALLOWED_TABLES = new Set([
  'leads',
  // Relationship Engine contact spine (backs the "Leads" tab). A thumbs-down here
  // also suppresses the contact from the warm queue — see the post-insert step below.
  'contacts',
  'content_ideas',
  'nova_target_conferences',
  'visibility_targets',
  'guests',
  'tasks',
  'customers',
  'bets',
  'opportunities',
  'corrections',
  'home_intelligence',
  // Objective Layer, Phase 3 (2026-05-29). goals and milestones become
  // feedback targets so Krish can reject Marcus-nominated objectives at the
  // objective altitude (marcus_objective_nomination_rejected) and reject or
  // tweak proposed milestones at the milestone altitude (marcus_milestone_override).
  'goals',
  'milestones',
  // Weekly altitude (Phase 6): which candidate moves Krish picks, writes himself,
  // or dismisses teaches Marcus's weekly slate. source_id is the milestone id (or
  // a week-scoped synthetic id for a custom move).
  'weekly_slate',
])

// Canonical reason codes for the three Marcus feedback altitudes plus the
// preexisting callers. Documentation, not strict enforcement: the field
// stays open so unknown codes still write through (Vera handles them as
// 'other'), but typos and divergence are surfaced via a 1-line warn log
// in the response payload. Adding a code here is how you canonize it.
const REASON_OPTIONS = new Set([
  // Marcus three altitudes (Objective Layer, Phase 3).
  'marcus_priority_override',          // daily: wrong task to elevate today.
  'marcus_milestone_override',         // milestone: right work, wrong week-sized chunk.
  'marcus_objective_nomination_rejected', // objective: whole objective is wrong shape.
  'marcus_objective_amended',          // objective: right objective, Krish reshaped its title.
  'marcus_objective_releveled',        // objective: mis-leveled — promoted a parent / demoted to a milestone.
  'marcus_weekly_slate_override',      // weekly: the slate missed this move (Krish wrote his own) or he dismissed one.
  // Preexisting codes already in use across the app.
  'marcus_suggestion_unsuitable',
  'triage_promote',
  'lead_other',
  // Relationship Engine contact reasons (Leads tab thumbs-down).
  'contact_already_engaged',
  'contact_not_a_fit',
  'contact_wrong_venture',
  'contact_no_budget_signal',
  'contact_bad_timing',
  'contact_other',
  // Daily spine close (Phase 1): end-of-day reflection + tomorrow seed.
  'daily_reflection',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    source_table?: string
    source_id?: string
    agent_id?: string | null
    vote?: number
    reason_code?: string | null
    reason_text?: string | null
    meta?: Record<string, unknown> | null
  }

  if (!body.source_table || !ALLOWED_TABLES.has(body.source_table)) {
    return res.status(400).json({ ok: false, error: 'invalid source_table' })
  }
  if (!body.source_id) {
    return res.status(400).json({ ok: false, error: 'source_id required' })
  }
  if (body.vote !== 1 && body.vote !== -1) {
    return res.status(400).json({ ok: false, error: 'vote must be 1 or -1' })
  }
  if (body.meta != null && (typeof body.meta !== 'object' || Array.isArray(body.meta))) {
    return res.status(400).json({ ok: false, error: 'meta must be an object' })
  }

  const unknownReasonCode = body.reason_code && !REASON_OPTIONS.has(body.reason_code)
    ? body.reason_code
    : null

  const { data, error } = await supabase
    .from('feedback_queue')
    .insert({
      source_table: body.source_table,
      source_id: body.source_id,
      agent_id: body.agent_id || null,
      original_agent: body.agent_id || null,
      original_item_id: body.source_id,
      vote: body.vote,
      reason_code: body.reason_code || null,
      reason_text: body.reason_text || null,
      meta: body.meta || {},
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ ok: false, error: error.message })
  }

  // Immediate-effect loop: a thumbs-down on a Relationship Engine contact also
  // suppresses it from the warm/triaged surfaces right away (triage_status =
  // 'skipped'), so "taken into account on the next run" is true instantly — not
  // only after Vera's weekly aggregation. The feedback_queue row still feeds Vera
  // so a repeated pattern can still teach the scout's brief. Best-effort: a
  // failure here does not fail the feedback write.
  let suppressed = false
  if (body.source_table === 'contacts' && body.vote === -1) {
    const { error: supErr } = await supabase
      .from('contacts')
      .update({ triage_status: 'skipped', triaged_at: new Date().toISOString() })
      .eq('id', body.source_id)
    suppressed = !supErr
  }

  return res.json({
    ok: true,
    feedback: data,
    ...(suppressed ? { suppressed: true } : {}),
    ...(unknownReasonCode
      ? { warning: `reason_code '${unknownReasonCode}' is not in REASON_OPTIONS; Vera will cluster it as 'other'. Add to REASON_OPTIONS to canonize.` }
      : {}),
  })
}
