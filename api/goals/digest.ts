import type { VercelRequest, VercelResponse } from '@vercel/node'
import { goalsSpine, loadActiveGoals } from '../_goals.js'

// GET /api/goals/digest
//
// The rendered ladder at one canonical URL, so every consumer reads the same
// text instead of each assembling its own view of what the goals are.
//
// This mirrors how standards already reach the fleet: standards_registry is
// rendered nightly to hot/standards-digest.md by regenerate-standards-digest.py
// on the VPS (scripts/cron/crontab.txt line 3), and agents load that file at
// wake. Goals now have the same shape of source.
//
//   ?format=text  (default) the block an agent pastes into context
//   ?format=json            the structured ladder plus the block
//
// NOT YET WIRED, and deliberately not faked: nothing on the VPS pulls this on a
// schedule. The agent wake protocol already reads the goals table directly via
// agent_plans.weekly_goal_id, so the fleet is not blind meanwhile; this gives
// the renderer a single endpoint when that cron is added. sync_queue was the
// obvious candidate to enqueue on and is the wrong table: its rows carry
// agent_id and are drained by poll_sync_queue.py into per-agent brief mirrors,
// so a goals row there would be misuse, not integration.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' })

  const context = typeof req.query.context === 'string' && req.query.context.trim()
    ? req.query.context.trim().slice(0, 120)
    : 'deciding what to work on'

  try {
    if (req.query.format === 'json') {
      const spine = await loadActiveGoals()
      const { prompt } = await goalsSpine(context)
      return res.json({ ok: true, prompt, ...spine })
    }
    const { prompt } = await goalsSpine(context)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(prompt)
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'digest failed' })
  }
}
