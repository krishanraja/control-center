import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { notifyOps } from '../_alert.js'
import { getOperatorTz, ymdIn, shiftYmd } from '../_timezone.js'
import {
  weekEndingFor, deriveWeek, mergeOverrides, varianceNote, loadRows, fmtYmd,
} from '../_scorecard.js'

// The Friday freeze and variance note (job 2, keep him honest).
//
// Runs Saturday 04:30 UTC, which is 00:30 in New York, so all of Friday is in
// the week. Derives the week from the ledgers, applies any operator override,
// writes the six columns to scorecard_weeks with frozen_at, and sends the
// variance note to Telegram: what was sent against the plan, what slipped,
// hours building unasked.
//
// The Rule 6 tripwire lives here too. Any unasked hours in the week raise a
// silent_failures row (tier 3, failure_type 'unasked_hours') so the critical
// banner on Home says it out loud. One row per day, the same dedup
// api/health/fleet-reconcile.ts uses, so a rerun cannot multiply the alarm.
//
// Nothing here sends email. The Monday note drafts one; this never does.
//
//   GET (CRON_SECRET)   POST (manual, through the edge gate)
//   ?week_ending=YYYY-MM-DD freezes a named week, for backfills.

export const config = { maxDuration: 60 }

const PLAN_SENT_FLOOR = 5

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  try {
    const tz = await getOperatorTz()
    const q = typeof req.query?.week_ending === 'string' ? req.query.week_ending : ''
    const weekEnding = /^\d{4}-\d{2}-\d{2}$/.test(q)
      ? weekEndingFor(q)
      : weekEndingFor(shiftYmd(ymdIn(new Date(), tz), -1))

    const rows = await loadRows()
    const existing = rows.get(weekEnding)
    const derived = await deriveWeek(weekEnding, tz)
    const merged = mergeOverrides(derived, existing)
    const planSent = Math.max(PLAN_SENT_FLOOR, derived.drafted_this_week)
    const note = varianceNote(merged, planSent)
    const now = new Date().toISOString()

    // The derived columns are written as derived, never as merged: an
    // override sits in its own column beside the value it replaced, so the
    // table always shows both.
    const { error } = await supabase.from('scorecard_weeks').upsert({
      week_ending: weekEnding,
      approaches_sent: derived.approaches_sent,
      calls_taken: derived.calls_taken,
      paid_rooms: derived.paid_rooms,
      cash_invoiced_gbp: derived.cash_invoiced_gbp,
      pieces_published: derived.pieces_published,
      unasked_hours: derived.unasked_hours,
      plan_sent: planSent,
      variance_note: note,
      frozen_at: now,
      updated_at: now,
    }, { onConflict: 'week_ending' })
    if (error) throw new Error(`scorecard_weeks upsert failed: ${error.message}`)

    const telegram = await notifyOps(`Friday variance note. ${note}`)

    let tripwire: 'raised' | 'already_raised' | 'clear' = 'clear'
    if (merged.unasked_hours > 0) {
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
      const { data: dupe } = await supabase.from('silent_failures')
        .select('id').eq('workflow_id', 'rule-6-tripwire').eq('failure_type', 'unasked_hours')
        .gte('detected_at', dayAgo).is('resolved_at', null).limit(1)
      if (dupe && dupe.length) {
        tripwire = 'already_raised'
      } else {
        const { error: sfErr } = await supabase.from('silent_failures').insert({
          workflow_id: 'rule-6-tripwire',
          workflow_name: 'Rule 6 tripwire',
          tier: 3,
          failure_type: 'unasked_hours',
          detail: `${merged.unasked_hours}h building unasked (estimate from ${derived.commits} commits) in the week ending ${fmtYmd(weekEnding)}`,
          run_count: derived.commits,
        })
        if (sfErr) throw new Error(`silent_failures insert failed: ${sfErr.message}`)
        tripwire = 'raised'
      }
    }

    return res.status(200).json({
      ok: true, week_ending: weekEnding, values: merged, plan_sent: planSent,
      variance_note: note, telegram: telegram.sent, tripwire,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
