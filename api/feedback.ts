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
  // Content Engine v2 weekly queue (2026-08). Rejecting a card in This Week —
  // a brief, a proposed shift, a graduation — teaches the same loop the v1
  // triage deck fed. source_id is the content_decisions row id; meta carries
  // the decision kind + ref so Vera can cluster by what was actually refused.
  'content_decisions',
])

// Canonical reason codes. MIRROR of src/lib/servedSurfaces.ts -- that file is
// the source of truth and `npx tsx scripts/check-served-surfaces.mts` fails the
// build when the two drift.
//
// This list used to be hand-maintained alongside two other copies, and it had
// fallen 18 codes behind: every rejection of a task, bet, customer, opportunity
// or correction wrote through as an unknown code and Vera clustered it as
// 'other'. Codes are append-only -- 389 feedback rows reference the existing
// ones, and renaming a code orphans its history.
const REASON_OPTIONS = new Set([
  // tasks
  'task_not_a_priority',
  'task_wrong_framing',
  'task_outdated_context',
  'task_already_done',
  'task_not_mine',
  'task_too_small',
  'task_other',
  // leads
  'lead_wrong_seniority',
  'lead_wrong_company_size',
  'lead_no_budget_signal',
  'lead_already_contacted',
  'lead_wrong_venture_tag',
  'lead_too_technical',
  'lead_off_vertical',
  'lead_no_warm_path',
  'lead_other',
  // contacts
  'contact_already_engaged',
  'contact_not_a_fit',
  'contact_wrong_venture',
  'contact_no_budget_signal',
  'contact_bad_timing',
  'contact_too_technical',
  'contact_off_vertical',
  'contact_wrong_seniority',
  'contact_cold',
  'contact_other',
  // guests
  'guest_wrong_show',
  'guest_too_inside_baseball',
  'guest_not_a_builder',
  'guest_too_high_profile',
  'guest_too_technical',
  'guest_off_vertical',
  'guest_wrong_profile',
  'guest_recently_appeared',
  'guest_low_reach',
  'guest_no_hook',
  'guest_other',
  // visibility_targets
  'visibility_wrong_audience',
  'visibility_bad_timing',
  'visibility_already_pitched',
  'visibility_too_low_tier',
  'visibility_wrong_location',
  'visibility_unlikely_accepted',
  'visibility_pay_to_play',
  'visibility_no_relevant_talk',
  'visibility_too_technical',
  'visibility_off_vertical',
  'visibility_other',
  // nova_target_conferences
  'visibility_wrong_audience',
  'visibility_bad_timing',
  'visibility_already_pitched',
  'visibility_too_low_tier',
  'visibility_wrong_location',
  'visibility_pay_to_play',
  'visibility_off_vertical',
  'visibility_other',
  // content_ideas
  'content_thin',
  'content_too_generic',
  'content_not_my_voice',
  'content_old_news',
  'content_already_covered',
  'content_too_negative',
  'content_too_technical',
  'content_too_promotional',
  'content_off_vertical',
  'content_wrong_venture',
  'content_other',
  // content_decisions
  'content_wrong_topic',
  'content_wrong_angle',
  'content_already_covered',
  'content_old_news',
  'content_too_generic',
  'content_not_my_voice',
  'content_bad_timing',
  'content_other',
  // goals
  'marcus_objective_nomination_rejected',
  'marcus_objective_amended',
  'marcus_objective_releveled',
  'goal_bad_timing',
  'goal_not_measurable',
  'goal_other',
  // milestones
  'marcus_milestone_override',
  'milestone_bad_timing',
  'milestone_too_big',
  'milestone_not_mine',
  'milestone_other',
  // weekly_slate
  'marcus_weekly_slate_override',
  'weekly_wrong_altitude',
  'weekly_already_moving',
  'weekly_other',
  // home_intelligence
  'marcus_priority_override',
  'marcus_suggestion_unsuitable',
  'priority_bad_timing',
  'priority_already_done',
  'priority_other',
  // customers
  'customer_wrong_segment',
  'customer_missing_context',
  'customer_stale_signal',
  'customer_other',
  // bets
  'bet_not_falsifiable',
  'bet_wrong_hypothesis',
  'bet_wrong_size',
  'bet_bad_timing',
  'bet_other',
  // opportunities
  'opp_no_revenue_path',
  'opp_wrong_ICP',
  'opp_too_low_signal',
  'opp_bad_timing',
  'opp_other',
  // corrections
  'correction_no_action',
  'correction_wrong_pattern',
  'correction_too_broad',
  'correction_already_fixed',
  'correction_other',
  // Operational, not surface reject-reasons.
  'triage_promote', // right-swipe promote on a triage deck (vote=1)
  'content_advanced', // right-swipe advance on the Content deck (vote=1)
  'daily_reflection', // end-of-day reflection + tomorrow seed
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

  // The receipt. Vera's clusterer groups unconsumed -1 rows by
  // (agent, source_table, reason_code) and fires at >= 3, or >= 2 once the row
  // carries any code at all ('other' is its stand-in for a missing one). Krish
  // asked to see that his feedback compounds; the honest way to show it is the
  // real distance to the real threshold, read back from the real table.
  //
  // Best-effort: the count is a nicety and must never fail the write it
  // describes.
  let pattern: { count: number; threshold: number; remaining: number } | null = null
  if (body.vote === -1) {
    const threshold = body.reason_code ? 2 : 3
    const q = supabase
      .from('feedback_queue')
      .select('id', { count: 'exact', head: true })
      .eq('source_table', body.source_table)
      .lt('vote', 0)
      .neq('status', 'consumed')
    const scoped = body.reason_code
      ? q.eq('reason_code', body.reason_code)
      : q.is('reason_code', null)
    const { count, error: cErr } = body.agent_id
      ? await scoped.eq('agent_id', body.agent_id)
      : await scoped
    if (!cErr && typeof count === 'number') {
      pattern = { count, threshold, remaining: Math.max(0, threshold - count) }
    }
  }

  return res.json({
    ok: true,
    feedback: data,
    ...(pattern ? { pattern } : {}),
    ...(suppressed ? { suppressed: true } : {}),
    ...(unknownReasonCode
      ? { warning: `reason_code '${unknownReasonCode}' is not in REASON_OPTIONS; Vera will cluster it as 'other'. Add to REASON_OPTIONS to canonize.` }
      : {}),
  })
}
