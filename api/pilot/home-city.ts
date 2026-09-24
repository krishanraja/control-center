import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getOperatorHomeCity, setOperatorHomeCity, isHomeCity, HOME_CITIES, TEMPORARY_CITIES } from '../_homeCity.js'
import { guard } from '../_auth.js'

/**
 * /api/pilot/home-city
 *
 * GET returns which city Krish is in. PUT sets it.
 *
 * The twin of /api/pilot/timezone, and deliberately shaped the same way: one
 * setting, read by the events cron, the lane the browser renders, and SQL through
 * public.operator_home_city(). Before this existed the attend lane had no idea
 * where he was, which is why it never changed when he moved.
 *
 * Unlike the timezone, the device is NOT the authority here. A browser can
 * resolve its own zone from the operating system; it cannot know whether he is
 * in London for a fortnight or passing through for a day, and it must not
 * relocate his event list because he opened a laptop in an airport. So this
 * value only ever changes because he pressed something. src/lib/homeCity.ts
 * offers the timezone-implied city as the first suggestion and stops there.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && guard(req, res, ['PUT'])) return

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    return res.json({
      ok: true,
      city: await getOperatorHomeCity(),
      cities: HOME_CITIES,
      // Named so the UI can mark it rather than hard-coding the same fact twice:
      // Sydney is a button press, never a resting state (architecture doc §3).
      temporary: TEMPORARY_CITIES,
    })
  }

  if (req.method === 'PUT') {
    const body = (req.body || {}) as Record<string, unknown>
    if (!isHomeCity(body.city)) {
      return res.status(400).json({ ok: false, error: 'Unsupported home city', cities: HOME_CITIES })
    }
    try {
      await setOperatorHomeCity(body.city)
      return res.json({ ok: true, city: body.city })
    } catch (e) {
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'Could not save' })
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
