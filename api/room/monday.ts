import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { notifyOps } from '../_alert.js'
import { draftTarget, TARGET_SELECT, type RoomTarget } from '../_room.js'

// GET /api/room/monday   cron, 0 10 * * 1 (vercel.json)
//
// The Monday half of job 1: five drafted approaches waiting when Krish opens
// the Room. Takes up to five listed targets, freshest trigger first, and runs
// trigger then draft for each in turn. One failure never stops the rest, and
// the Telegram line at the end says the real count, not "ran".
//
// Drafts only. This file imports nothing that can send.

export const config = { maxDuration: 300 }

const BATCH = 5

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (guardCronRoute(req, res)) return

  const drafted: string[] = []
  const failed: { id: string; name: string; error: string }[] = []

  try {
    const { data, error } = await supabase
      .from('room_targets')
      .select(TARGET_SELECT)
      .eq('state', 'listed')
      .order('trigger_found_at', { ascending: false, nullsFirst: false })
      .order('listed_at', { ascending: true })
      .limit(BATCH)
    if (error) throw new Error(error.message)
    const targets = (data || []) as unknown as RoomTarget[]

    for (const t of targets) {
      const name = (t.contact?.full_name || '').trim() || t.id
      try {
        await draftTarget(t)
        drafted.push(name)
      } catch (e: unknown) {
        failed.push({ id: t.id, name, error: (e as Error)?.message?.slice(0, 160) || 'draft_failed' })
      }
    }

    const summary = summarise(targets.length, drafted.length, failed.length)
    const tg = await notifyOps(summary)
    return res.status(200).json({ ok: true, listed: targets.length, drafted, failed, summary, notified: tg.sent })
  } catch (e: unknown) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'monday_failed'
    await notifyOps(`The Monday Room run failed before drafting: ${msg}`)
    return res.status(500).json({ ok: false, error: msg, drafted, failed })
  }
}

function summarise(listed: number, ok: number, bad: number): string {
  if (listed === 0) return 'Nobody is listed in the Room, so nothing was drafted. Open People, Room and find five.'
  if (ok === BATCH && bad === 0) return 'Five approaches are drafted. Open People, Room.'
  const head = ok === 0
    ? 'No approaches were drafted'
    : `${ok} approach${ok === 1 ? ' is' : 'es are'} drafted`
  const tail = bad ? `, ${bad} failed` : ''
  return `${head}${tail}. Open People, Room.`
}
