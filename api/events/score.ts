import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { hasAnthropicKey } from '../_content.js'
import { raiseQuotaAlert } from '../_alert.js'
import { errored, isBlocking, ok, summarise, type ProviderOutcome } from '../_quota.js'
import { scoreEvent, SCORE_VERSION, type EventScoreInput } from '../_eventScore.js'

// GET /api/events/score   cron, 0 7 * * * (vercel.json)
//
// The ICP gate for the attend lane. One model call per event, judging who is in
// the room; every number computed in api/_eventScore.ts.
//
// This replaces /root/.openclaw/workspace/scripts/score-events.py, which is not
// in version control. What it left behind, measured 2026-09-24: of 18
// recommendable upcoming rows, 7 had any non-zero score, across two distinct
// values per axis, and named_attendees was empty on all 18. So the axes were not
// really scored, and the one field that proves who is in a room was never filled.
//
// Rows scored under the old Draw definition are marked scored_source='vps_legacy'
// by the migration and re-scored here, because a number produced by "technical
// leader density is good" cannot be compared with one produced by the opposite.

export const config = { maxDuration: 300 }

/** Per run. One model call each, and the cron runs daily, so this clears a
 *  330-row backlog inside a fortnight while leaving room for new arrivals. */
const BATCH = 25

/** A score older than this is re-judged even if nothing else changed: a room's
 *  speaker list fills up as the date approaches, and named attendees are the
 *  highest-signal field. */
const RESCORE_AFTER_DAYS = 30

interface Row extends EventScoreInput {
  id: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (guardCronRoute(req, res)) return

  const started = new Date()

  // No key is not a zero score. A row scored 0 reads as a verdict on the room
  // for as long as it sits there, so with no way to judge, this route does
  // nothing and says so — the failure mode check-enrichment-honesty.mts exists
  // to prevent.
  if (!hasAnthropicKey()) {
    await supabase.from('workflow_runs').insert({
      workflow_id: 'events-score',
      workflow_name: 'Events scoring',
      agent_id: 'nova',
      run_at: started.toISOString(),
      duration_ms: Date.now() - started.getTime(),
      outcome: 'No Anthropic key: nothing scored. An unscored row is honest, a zero is not.',
      outcome_count: 0,
      status: 'error',
      metadata: { reason: 'no_anthropic_key' },
    })
    return res.status(503).json({ ok: false, error: 'no_anthropic_key' })
  }

  const outcomes: ProviderOutcome[] = []
  const scored: { title: string; draw: number; demand: number }[] = []
  const failed: { id: string; error: string }[] = []

  try {
    const cutoff = new Date(started.getTime() - RESCORE_AFTER_DAYS * 24 * 3600 * 1000).toISOString()
    const limit = Math.min(Number(req.query?.limit) || BATCH, 60)

    // The work queue, in the order the index supports: never scored first, then
    // scored under the old definition, then simply stale. Past events are
    // excluded because scrub archives them and judging a finished room is spend
    // with no reader.
    const { data, error } = await supabase
      .from('events')
      .select('id, title, host, host_kind, description, url, city, venue, cost_kind, ticket_price_usd, starts_at')
      .is('archived_at', null)
      .gt('starts_at', started.toISOString())
      .or(`scored_at.is.null,scored_source.eq.vps_legacy,score_version.lt.${SCORE_VERSION},scored_at.lt.${cutoff}`)
      .order('scored_at', { ascending: true, nullsFirst: true })
      .order('starts_at', { ascending: true })
      .limit(limit)
    if (error) throw new Error(error.message)

    const rows = (data || []) as unknown as Row[]

    for (const row of rows) {
      try {
        const result = await scoreEvent({
          title: row.title,
          host: row.host,
          host_kind: row.host_kind,
          description: row.description,
          url: row.url,
          city: row.city,
          venue: row.venue,
          cost_kind: row.cost_kind,
          ticket_price_usd: row.ticket_price_usd,
          starts_at: row.starts_at,
        })
        const { error: uErr } = await supabase.from('events').update({
          peer_density: result.peer_density,
          buyer_density: result.buyer_density,
          practitioner_density: result.practitioner_density,
          vendor_density: result.vendor_density,
          seniority: result.seniority,
          seniority_note: result.seniority_note || null,
          named_attendees: result.named_attendees.length ? result.named_attendees : null,
          draw_score: result.draw_score,
          demand_score: result.demand_score,
          score_reason: result.score_reason || null,
          scored_at: new Date().toISOString(),
          scored_source: 'cron',
          score_version: result.score_version,
          // The room's composition is what host_kind was always meant to record,
          // and discovery can only ever write 'unknown'. Set it from the judgment
          // so the watchlist and the corpus agree on what kind of room this is.
          host_kind: result.vendor_density >= 60 ? 'vendor'
            : result.practitioner_density >= 60 ? 'community'
            : result.peer_density >= 50 ? 'operator'
            : row.host_kind || 'unknown',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        if (uErr) throw new Error(uErr.message)
        outcomes.push(ok('anthropic'))
        scored.push({ title: row.title, draw: result.draw_score, demand: result.demand_score })
      } catch (e: unknown) {
        const msg = (e as Error)?.message?.slice(0, 160) || 'score_failed'
        outcomes.push(errored('anthropic', msg))
        failed.push({ id: row.id, error: msg })
      }
    }

    // A blocked provider with nothing scored stops and alerts; with some scored
    // it keeps the work and still alerts. Same two legal outcomes as
    // api/network/enrich-person.ts.
    const blocked = outcomes.filter(isBlocking)
    if (blocked.length) {
      await raiseQuotaAlert({
        blocked,
        subject: `events scoring (${scored.length} scored, ${failed.length} failed)`,
        source: 'api/events/score',
      })
    }

    await supabase.from('workflow_runs').insert({
      workflow_id: 'events-score',
      workflow_name: 'Events scoring',
      agent_id: 'nova',
      run_at: started.toISOString(),
      duration_ms: Date.now() - started.getTime(),
      outcome: `${scored.length} event(s) scored, ${failed.length} failed${blocked.length ? `, provider blocked` : ''}`,
      outcome_count: scored.length,
      status: blocked.length && !scored.length ? 'error'
        : failed.length && !scored.length ? 'error'
        : 'success',
      metadata: { scored: scored.length, failed: failed.length, score_version: SCORE_VERSION, degraded: blocked.length > 0 },
    })

    if (blocked.length && !scored.length) {
      return res.status(502).json({ ok: false, error: 'provider_blocked', blocked, failed })
    }
    return res.status(200).json({
      ok: true,
      scored,
      failed,
      degraded: blocked.length ? blocked.map(b => ({ api: b.api, status: b.status })) : [],
      summary: summarise(outcomes),
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'score_failed'
    return res.status(500).json({ ok: false, error: msg, scored, failed })
  }
}
