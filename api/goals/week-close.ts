import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { getOperatorTz } from '../_timezone.js'
import { weekStartIn } from '../_week.js'

// The Saturday close of the weekly rung.
//
// Runs Saturday 05:00 UTC (01:00 in New York in both halves of the year), so
// the whole of Friday is inside the week it closes. Every weekly objective
// whose week has ended and is still active becomes `missed`; done ones get
// their closed_at stamped if the toggle did not already. Nothing is deleted:
// the goals table is the archive, the ladder simply stops reading closed rows,
// and Monday's ritual offers last week's set back with its outcomes.
//
// Idempotent: a second run on the same Saturday finds nothing active in a
// past week and writes nothing. One audit_log row per run that closed
// anything, so a week that closed with three misses is visible in the feed.
//
//   GET (CRON_SECRET)   POST (manual, through the edge gate)

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  try {
    const tz = await getOperatorTz()
    const currentWeek = weekStartIn(new Date(), tz)
    const now = new Date().toISOString()

    const { data: open, error: readErr } = await supabase
      .from('goals')
      .select('id, title, status, week_start')
      .eq('horizon', 'weekly')
      .in('status', ['active', 'done'])
      .lt('week_start', currentWeek)
    if (readErr) return res.status(500).json({ ok: false, error: readErr.message })

    const rows = (open || []) as Array<{ id: string; title: string; status: string; week_start: string }>
    const missed = rows.filter(r => r.status === 'active')
    const done = rows.filter(r => r.status === 'done')

    if (missed.length) {
      const { error } = await supabase
        .from('goals')
        .update({ status: 'missed', closed_at: now, updated_at: now })
        .in('id', missed.map(r => r.id))
      if (error) return res.status(500).json({ ok: false, error: error.message })
    }
    if (done.length) {
      const { error } = await supabase
        .from('goals')
        .update({ closed_at: now })
        .in('id', done.map(r => r.id))
        .is('closed_at', null)
      if (error) return res.status(500).json({ ok: false, error: error.message })
    }

    if (missed.length || done.length) {
      await supabase.from('audit_log').insert({
        id: `goal-week-closed-${Date.now()}`,
        event_type: 'goal_week_closed',
        actor: 'system',
        target: currentWeek,
        changes: {
          current_week: currentWeek,
          missed: missed.map(r => ({ id: r.id, title: r.title, week_start: r.week_start })),
          done: done.map(r => ({ id: r.id, title: r.title, week_start: r.week_start })),
        },
        display_message: `Week closed: ${done.length} done, ${missed.length} missed`,
      }).then(() => {}, () => {})
    }

    return res.json({
      ok: true,
      current_week: currentWeek,
      missed: missed.length,
      done: done.length,
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'week close failed' })
  }
}
