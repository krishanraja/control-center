import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { collectSeedCandidates, DEFAULT_WINDOW_DAYS } from '../_seedSources.js'
import { supabase } from '../_supabase.js'
import { buildVideoStudioFeed } from '../_videoStudioExport.js'

const clampInt = (raw: unknown, min: number, max: number, fallback: number): number => {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'VIDEO_STUDIO_EXPORT_TOKEN', ['GET'])) return
  const windowDays = clampInt(req.query.window_days ?? req.query.days, 1, 90, DEFAULT_WINDOW_DAYS)
  const limit = clampInt(req.query.limit, 1, 50, 24)
  try {
    const candidates = await collectSeedCandidates(supabase, { windowDays, limit })
    return res.status(200).json(buildVideoStudioFeed(candidates))
  } catch (error) {
    console.error('video studio export failed', error)
    return res.status(500).json({ ok: false, error: 'video studio export failed' })
  }
}
