import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// When each People lane last got new material, and from what. Every lane
// shows this line so a quiet lane is distinguishable from a broken one.

export const config = { maxDuration: 30 }

async function latest(table: string, column: string, filter?: (q: any) => any): Promise<string | null> {
  let q: any = supabase.from(table).select(column).not(column, 'is', null).order(column, { ascending: false }).limit(1)
  if (filter) q = filter(q)
  const { data, error } = await q
  if (error || !data || !data.length) return null
  return (data[0] as Record<string, string | null>)[column] || null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return
  try {
    const [hunterRun, hunterCommand, guestScout, targetEnrich, targetAdded, roomTrigger, contactAdded] = await Promise.all([
      latest('workflow_runs', 'run_at', q => q.eq('agent_id', 'hunter')),
      latest('hunter_commands', 'finished_at'),
      latest('guests', 'last_scouted_at'),
      latest('visibility_targets', 'deep_enriched_at'),
      latest('visibility_targets', 'created_at'),
      latest('room_targets', 'trigger_found_at'),
      latest('contacts', 'created_at'),
    ])
    return res.status(200).json({
      ok: true,
      hunt: { at: [hunterRun, hunterCommand].filter(Boolean).sort().pop() || null, by: 'the hunter run' },
      visibility: {
        at: [guestScout, targetEnrich, targetAdded].filter(Boolean).sort().pop() || null,
        by: 'the Monday guest scout, the Tuesday target refresh, or you',
        guests_scouted_at: guestScout, targets_enriched_at: targetEnrich, targets_added_at: targetAdded,
      },
      room: { at: roomTrigger, by: 'the Monday Room run' },
      network: { at: contactAdded, by: 'you' },
    })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'freshness_failed' })
  }
}
