import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { dispatchHunter } from '../_hunterDispatch.js'

// Hunter's clock.
//
// GitHub's own scheduler is best effort and on the hunter repository it ran
// hours late: on Sunday 27 September the 12:00 UTC job started at 15:54, a
// London-clock guard in the workflow skipped it, and Krish got no batch that
// week. The "hourly" drain was firing every four to seven hours.
//
// Vercel's cron fires on the minute, so this route is the tick: every hour it
// wakes hunter with a bare drain. It decides nothing. Whether a full run is
// owed is decided inside hunter (src/hunter/schedule.py) from the run record,
// so a late or missed tick delays a batch by an hour and cannot drop one, and
// two ticks during a running batch cannot start a second paid sweep.
//
//   GET (CRON_SECRET), hourly at :13   ·   POST, a manual tick from the app

export const config = { maxDuration: 15 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const d = await dispatchHunter('hunter-drain')
  // A tick that could not be sent is reported, not swallowed: the six-hourly
  // GitHub fallback still drains, but slower, and that should be visible.
  return res.status(d.sent ? 200 : 502).json({ ok: d.sent, dispatched: d.sent, error: d.error })
}
