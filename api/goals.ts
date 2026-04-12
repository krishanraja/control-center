import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const GOALS_PATH = join(process.cwd(), 'public', 'data', 'goals.json')

function readGoals() {
  try {
    return JSON.parse(readFileSync(GOALS_PATH, 'utf8'))
  } catch {
    return { goals: [], week_of: '', north_star: '', team_focus: '' }
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method === 'GET') return res.json(readGoals())

  if (req.method === 'PATCH') {
    const body = req.body || {}
    const data = readGoals()

    if (body.team_focus !== undefined) data.team_focus = body.team_focus
    if (body.north_star !== undefined) data.north_star = body.north_star

    if (body.goalId) {
      const goal = (data.goals || []).find((g: any) => g.id === body.goalId)
      if (goal) {
        if (body.title    !== undefined) goal.title    = body.title
        if (body.current  !== undefined) goal.current  = body.current
        if (body.progress !== undefined) goal.progress = Math.max(0, Math.min(100, Number(body.progress)))
        if (body.notes    !== undefined) goal.notes    = body.notes
      }
    }

    data.updated_at = new Date().toISOString()

    try {
      writeFileSync(GOALS_PATH, JSON.stringify(data, null, 2))
    } catch {}

    return res.json({ ok: true, goals: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
// sync handler added below
