import type { VercelRequest, VercelResponse } from '@vercel/node'

// In-memory mutable store (resets on cold start — acceptable for dashboard)
// For persistence across deploys, swap GOALS to a KV store or Supabase row.
let GOALS: {
  week_of: string
  north_star: string
  team_focus: string
  goals: Array<{
    id: string
    title: string
    target: string
    current: string
    owner: string
    progress: number
    notes?: string
  }>
} = {
  week_of: 'Apr 7, 2026',
  north_star: 'First paying client signed. Content flywheel live. Team running independently.',
  team_focus: 'Close Skyview. Get content flywheel started. Nell builds first guest pipeline.',
  goals: [
    { id: 'g1', title: 'Close Skyview engagement', target: '$120K proposal signed', current: 'In proposal stage', owner: 'Felix', progress: 40 },
    { id: 'g2', title: 'Launch content flywheel', target: '4 briefs + 2 drafts published', current: 'Week 1 sweep pending', owner: 'Cleo', progress: 10 },
    { id: 'g3', title: 'Revenue tracking live', target: 'Leo reporting weekly by Apr 14', current: 'Blocked on Stripe key', owner: 'Leo', progress: 0 },
    { id: 'g4', title: 'Podcast guest pipeline', target: '6 pitches sent by Apr 14', current: 'Blocked on recording availability', owner: 'Nell', progress: 0 },
    { id: 'g5', title: 'Agent OS stable', target: '0 missed cron runs this week', current: '0 missed so far', owner: 'Vera', progress: 90 }
  ]
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    return res.json(GOALS)
  }

  if (req.method === 'PATCH') {
    const body = req.body || {}

    // Patch team_focus (existing behaviour)
    if (body.team_focus !== undefined) {
      GOALS.team_focus = body.team_focus
    }

    // Patch north_star
    if (body.north_star !== undefined) {
      GOALS.north_star = body.north_star
    }

    // Patch an individual goal by id
    // Body: { goalId, title?, current?, progress?, notes? }
    if (body.goalId) {
      const goal = GOALS.goals.find(g => g.id === body.goalId)
      if (goal) {
        if (body.title !== undefined) goal.title = body.title
        if (body.current !== undefined) goal.current = body.current
        if (body.progress !== undefined) goal.progress = Math.max(0, Math.min(100, Number(body.progress)))
        if (body.notes !== undefined) goal.notes = body.notes
      }
    }

    return res.json({ ok: true, goals: GOALS })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
