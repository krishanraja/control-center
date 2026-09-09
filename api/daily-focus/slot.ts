import type { VercelRequest, VercelResponse } from '@vercel/node'
import { upsertSlots, validateSlot, isYmd, type SlotInput } from '../_dailyFocus.js'
import { guard } from '../_auth.js'

// POST /api/daily-focus/slot
//   Body: { date, slot: 1|2|3, text, goal_id?, job? }
//
// Writes ONE of today's 3 by hand, from the editable slots on Home. Empty text
// clears the slot. The row stays `pending`: only the ritual lock
// (api/daily-focus/calibrate.ts) declares a day calibrated and fires the
// n8n Focus Calibrator. Manual first, machine when asked.

interface Body {
  date?: string
  slot?: number
  text?: string
  goal_id?: string | null
  job?: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  if (!isYmd(body.date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' })

  const slot: Partial<SlotInput> = {
    slot: Number(body.slot) as SlotInput['slot'],
    text: typeof body.text === 'string' ? body.text : '',
    goal_id: body.goal_id ?? null,
    job: body.job ?? null,
  }
  const problem = validateSlot(slot)
  if (problem) return res.status(400).json({ ok: false, error: problem })

  const { row, error, written } = await upsertSlots(body.date, [slot as SlotInput], { replace: true })
  if (error) return res.status(500).json({ ok: false, error })
  return res.json({ ok: true, row, written })
}
