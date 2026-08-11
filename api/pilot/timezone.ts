import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getOperatorTz, setOperatorTz, isValidTz } from '../_timezone.js'

/**
 * /api/pilot/timezone
 *
 * GET returns the operator's civil zone. PUT sets it.
 *
 * One setting drives every day boundary in the product: the pilot gate and
 * shutdown, the focus spine's week and day, daily_focus.focus_date, the ships
 * rollup, and the pilot_daily view through public.operator_tz(). Unauthenticated,
 * matching every other operator-facing route.
 *
 * The browser PUTs here whenever its resolved zone and the stored one disagree,
 * which on a travelling operator is "after most flights". The stored value is
 * only the fallback for callers with no browser (n8n, cron, the SQL views); the
 * device is the authority. See src/lib/civilDate.ts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    return res.json({ ok: true, timezone: await getOperatorTz() })
  }

  if (req.method === 'PUT') {
    const body = (req.body || {}) as Record<string, unknown>
    if (!isValidTz(body.timezone)) {
      return res.status(400).json({ ok: false, error: 'Unsupported timezone' })
    }
    try {
      await setOperatorTz(body.timezone)
      return res.json({ ok: true, timezone: body.timezone })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'Could not save' })
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
