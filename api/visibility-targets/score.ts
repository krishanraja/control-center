import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { hasAnthropicKey } from '../_content.js'
import { raiseQuotaAlert } from '../_alert.js'
import { errored, isBlocking, ok, summarise, type ProviderOutcome } from '../_quota.js'
import {
  scoreVisibilityTarget,
  isDeadDate,
  VISIBILITY_SCORE_VERSION,
  type VisibilityScoreInput,
} from '../_visibilityScore.js'

// GET /api/visibility-targets/score   cron, 30 7 * * 1 (vercel.json)
//
// Nova's standard, applied. One model call per target, judging the three things
// that have to be true at once: the audience contains the buyer, the platform
// carries authority, the angle is one only Krish can deliver. Every number is
// computed in api/_visibilityScore.ts; the model judges fit, code does maths.
//
// Three properties this route has that the thing it replaces did not:
//
//   1. A REJECTION IS A WRITE. The old rule lived in Nova's brief as "if I
//      cannot enrich a candidate to green or amber quality, DO NOT write the
//      row", so a refusal left no trace and nothing could be learned from it.
//      Here a refused target gets verdict='rejected' and one reason code from
//      the one taxonomy, and the surface shows it.
//
//   2. NO JUDGEMENT IS NOT A LOW SCORE. A row the material cannot support is
//      written verdict='unjudged' with the axes left null. A zero reads on the
//      card as a verdict on the stage for as long as it sits there, and it is
//      the same pixels as an honest zero. Same rule as events scoring and
//      api/_enrich.ts, and the reason check-enrichment-honesty.mts exists.
//
//   3. IT NEVER SENDS. Nothing here drafts, mails or applies. It writes a
//      verdict Krish reads. CI guard scripts/check-bridges-never-send.mts holds
//      that boundary for the surfaces that do draft.

export const config = { maxDuration: 300 }

/** Per run. One model call each. The queue is 108 open rows, so a weekly cron at
 *  this size clears the backlog in four weeks and then only sees new arrivals. */
const BATCH = 30

/** A verdict older than this is re-judged even if nothing changed on the row: a
 *  show's guest list and a conference's speaker list fill up as the date nears,
 *  and named people are the highest-signal field on either. */
const REJUDGE_AFTER_DAYS = 45

interface Row extends VisibilityScoreInput {
  id: string
  event_start_at: string | null
  deadline_at: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (guardCronRoute(req, res)) return

  const started = new Date()
  const run = (outcome: string, count: number, status: string, metadata: Record<string, unknown>) =>
    supabase.from('workflow_runs').insert({
      workflow_id: 'visibility-score',
      workflow_name: 'Visibility standard',
      agent_id: 'nova',
      run_at: started.toISOString(),
      duration_ms: Date.now() - started.getTime(),
      outcome,
      outcome_count: count,
      status,
      metadata,
    })

  // No key is not a verdict. With no way to judge, this route writes nothing and
  // says so, rather than leaving a corpus of zeroes that each read as a refusal.
  if (!hasAnthropicKey()) {
    await run(
      'No Anthropic key: nothing judged. An unjudged target is honest, a zero is a verdict nothing computed.',
      0, 'error', { reason: 'no_anthropic_key' },
    )
    return res.status(503).json({ ok: false, error: 'no_anthropic_key' })
  }

  const outcomes: ProviderOutcome[] = []
  const took: { title: string; score: number }[] = []
  const stretched: { title: string; score: number }[] = []
  const rejected: { title: string; reason: string }[] = []
  const unjudged: string[] = []
  const failed: { id: string; error: string }[] = []

  try {
    const cutoff = new Date(started.getTime() - REJUDGE_AFTER_DAYS * 24 * 3600 * 1000).toISOString()
    const limit = Math.min(Number(req.query?.limit) || BATCH, 60)

    // Never judged first, then judged under an older version of the standard,
    // then simply stale. Rows Krish has already acted on are left alone: a
    // verdict on a target he applied to months ago is spend with no reader.
    const { data, error } = await supabase
      .from('visibility_targets')
      .select([
        'id', 'title', 'type', 'organizer', 'organizer_reputation', 'audience',
        'audience_sector', 'audience_seniority', 'audience_size', 'location',
        'format', 'ticket_price_usd', 'event_start_at', 'deadline_at',
        'why_relevant', 'strategic_value', 'past_speakers', 'event_url', 'raw_data',
      ].join(', '))
      .in('status', ['sourced', 'queued'])
      .is('buried_at', null)
      .or(`scored_at.is.null,score_version.lt.${VISIBILITY_SCORE_VERSION},scored_at.lt.${cutoff}`)
      .order('scored_at', { ascending: true, nullsFirst: true })
      .order('deadline_at', { ascending: true, nullsFirst: false })
      .limit(limit)
    if (error) throw new Error(error.message)

    const rows = (data || []) as unknown as (Row & { raw_data?: Record<string, unknown> | null; event_url?: string | null })[]

    for (const row of rows) {
      try {
        // A date that has already passed needs no model call. Arithmetic is
        // cheaper and more reliable than asking, and a dead row judged on its
        // merits is a billable call spent on a stage nobody can stand on.
        if (isDeadDate(row, started)) {
          const { error: dErr } = await supabase.from('visibility_targets').update({
            verdict: 'rejected',
            reject_reason: 'visibility_bad_timing',
            score_reason: 'The date has passed.',
            room_score: null, standing_score: null, only_him_score: null, visibility_score: null,
            score_version: VISIBILITY_SCORE_VERSION,
            scored_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', row.id)
          if (dErr) throw new Error(dErr.message)
          rejected.push({ title: row.title, reason: 'visibility_bad_timing' })
          continue
        }

        const research = (row.raw_data as { direct_research?: { summary?: string } } | null)?.direct_research
        const result = await scoreVisibilityTarget({
          title: row.title,
          type: row.type,
          organizer: row.organizer,
          organizer_reputation: row.organizer_reputation,
          audience: row.audience,
          audience_sector: row.audience_sector,
          audience_seniority: row.audience_seniority,
          audience_size: row.audience_size,
          location: row.location,
          format: row.format,
          ticket_price_usd: row.ticket_price_usd,
          event_start_at: row.event_start_at,
          deadline_at: row.deadline_at,
          why_relevant: row.why_relevant,
          strategic_value: row.strategic_value,
          past_speakers: row.past_speakers,
          url: row.event_url,
          page_context: typeof research?.summary === 'string' ? research.summary : null,
        }, started)

        // null means the model said the material does not support a judgement.
        // That is recorded as unjudged, with every axis left NULL. It is never
        // written as a rejection either: "we could not tell" and "we looked and
        // it is wrong" are different facts and the card says which.
        if (!result) {
          const { error: uErr } = await supabase.from('visibility_targets').update({
            verdict: 'unjudged',
            reject_reason: null,
            room_score: null, standing_score: null, only_him_score: null, visibility_score: null,
            score_reason: 'Not enough on the page to say who is in this audience.',
            score_version: VISIBILITY_SCORE_VERSION,
            scored_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', row.id)
          if (uErr) throw new Error(uErr.message)
          outcomes.push(ok('anthropic'))
          unjudged.push(row.title)
          continue
        }

        const { error: wErr } = await supabase.from('visibility_targets').update({
          room_score: result.room_score,
          standing_score: result.standing_score,
          only_him_score: result.only_him_score,
          visibility_score: result.visibility_score,
          verdict: result.verdict,
          reject_reason: result.reject_reason,
          score_reason: result.score_reason || null,
          who_is_in_the_room: result.who_is_in_the_room || null,
          why_him: result.why_him || null,
          why_now: result.why_now || null,
          angle: result.angle || row.strategic_value || null,
          feeds_channel: result.feeds_channel,
          named_people: result.named_people.length ? result.named_people : null,
          score_version: result.score_version,
          scored_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        if (wErr) throw new Error(wErr.message)

        outcomes.push(ok('anthropic'))
        if (result.verdict === 'take') took.push({ title: row.title, score: result.visibility_score })
        else if (result.verdict === 'stretch') stretched.push({ title: row.title, score: result.visibility_score })
        else rejected.push({ title: row.title, reason: result.reject_reason || 'visibility_other' })
      } catch (e: unknown) {
        const msg = (e as Error)?.message?.slice(0, 160) || 'score_failed'
        outcomes.push(errored('anthropic', msg))
        failed.push({ id: row.id, error: msg })
      }
    }

    const blocked = outcomes.filter(isBlocking)
    if (blocked.length) {
      await raiseQuotaAlert({
        blocked,
        subject: `visibility standard (${took.length + stretched.length + rejected.length} judged, ${failed.length} failed)`,
        source: 'api/visibility-targets/score',
      })
    }

    const judged = took.length + stretched.length + rejected.length + unjudged.length
    await run(
      `${took.length} worth taking, ${stretched.length} stretch, ${rejected.length} refused, ${unjudged.length} unjudged, ${failed.length} failed`,
      judged,
      blocked.length && !judged ? 'error' : failed.length && !judged ? 'error' : 'success',
      {
        take: took.length, stretch: stretched.length, rejected: rejected.length,
        unjudged: unjudged.length, failed: failed.length,
        score_version: VISIBILITY_SCORE_VERSION, degraded: blocked.length > 0,
      },
    )

    if (blocked.length && !judged) {
      return res.status(502).json({ ok: false, error: 'provider_blocked', blocked, failed })
    }
    return res.status(200).json({
      ok: true,
      take: took, stretch: stretched, rejected, unjudged, failed,
      degraded: blocked.length ? blocked.map(b => ({ api: b.api, status: b.status })) : [],
      summary: summarise(outcomes),
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'score_failed'
    return res.status(500).json({ ok: false, error: msg, take: took, rejected, failed })
  }
}
