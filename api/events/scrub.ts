import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'

// GET /api/events/scrub   cron, 15 6 * * * (vercel.json)
//
// Nothing dead is displayed. Calls public.scrub_dead_events(), which archives on
// exactly four conditions and names the reason on every row it touches:
//
//   * a speaking deadline that has passed
//   * an event date that has passed
//   * a temporary item whose window closed (a temporary claim is a STATE, and
//     states revert)
//   * a free or cheap event more than 90 days out, which is unbookable noise
//
// ARCHIVING IS ONLY EVER FOR THE DEAD, and that is the load-bearing sentence in
// this file. An away-city event is UNACTIONABLE, not dead: it becomes live the
// moment a trip is booked. So actionability is decided at read time by
// events_for(home_city), never by an UPDATE here. Getting this wrong destroyed
// 26 New York rows once already (architecture doc section 3), which is why this
// route takes no city, passes none, and asserts below that it archived nothing
// for a reason the function does not recognise.

export const config = { maxDuration: 120 }

interface ScrubRow { archived: number; reason: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (guardCronRoute(req, res)) return

  const started = new Date()
  try {
    // No p_home_city argument, deliberately: the function accepts one and
    // nothing in its body should ever use it to archive. Passing none makes that
    // impossible rather than merely unlikely.
    const { data, error } = await supabase.rpc('scrub_dead_events')
    if (error) throw new Error(error.message)

    const rows = ((data || []) as ScrubRow[]).map(r => ({
      archived: Number(r.archived) || 0,
      reason: String(r.reason || 'unknown'),
    }))
    const total = rows.reduce((n, r) => n + r.archived, 0)

    // The tripwire. 'unknown' is the else branch of the function's CASE: it can
    // only be reached if a row matched the WHERE clause for a reason the reason
    // list does not cover, which means the two have drifted apart. Report it
    // loudly rather than counting it as a clean run.
    const unexplained = rows.filter(r => r.reason === 'unknown').reduce((n, r) => n + r.archived, 0)

    await supabase.from('workflow_runs').insert({
      workflow_id: 'events-scrub',
      workflow_name: 'Events scrub',
      agent_id: 'nova',
      run_at: started.toISOString(),
      duration_ms: Date.now() - started.getTime(),
      outcome: total
        ? `${total} dead event(s) archived: ${rows.map(r => `${r.archived} ${r.reason}`).join('; ')}`
        : 'Nothing dead to archive.',
      outcome_count: total,
      status: unexplained ? 'error' : 'success',
      metadata: { rows, unexplained },
    })

    return res.status(200).json({ ok: true, archived: total, rows, unexplained })
  } catch (e: unknown) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'scrub_failed'
    return res.status(500).json({ ok: false, error: msg })
  }
}
