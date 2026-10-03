import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { writeDailyMove } from '../_dailyMove.js'

/**
 * /api/strategist/daily: writes today's move (ADR-028).
 *
 * GET   Vercel's hourly cron, with CRON_SECRET. Writes once per operator-civil
 *       day, from 05:00 in his zone; every other hour it reads one row and
 *       returns. A day whose read failed three times waits for tomorrow.
 * POST  From the app (behind the access cookie) or with the secret: writes
 *       today's move now if it is not written, whatever the hour.
 *
 * It proposes and never acts: nothing it does sends, pushes or writes his
 * Today list. The move becomes his only when he takes it on Home. Reading it
 * back is GET /api/strategist?daily=today.
 */
export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  try {
    const r = await writeDailyMove({ force: req.method === 'POST' })
    return res.status(200).json({ ok: true, status: r.status, read_id: r.read_id ?? null, reasons: r.reasons ?? [] })
  } catch (e) {
    // Provider and database text stay in the log: either can carry a secret's name.
    console.warn(`daily_move_unexpected: ${(e as Error)?.message?.slice(0, 200)}`)
    return res.status(500).json({ ok: false, error: 'daily_move_failed' })
  }
}
