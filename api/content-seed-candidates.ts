import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { collectSeedCandidates, DEFAULT_WINDOW_DAYS } from './_seedSources.js'
import { guardSensitiveRead } from './_auth.js'

// GET — content-grade seed artifacts for the Content tab's seed rail.
//
// All gating (time-box, type/quality filters, dedupe, exclude already-seeded,
// ranking) lives in ./_seedSources.ts. This route is a thin transport: it runs
// the engine with the service-role client and returns a clean, ranked list.
// An empty list is a valid, honest answer — the rail renders an empty state.
//
//   ?days=<n>   override the recency window (1..90, default 21)
//   ?limit=<n>  override the cap (1..24, default 8)

const clampInt = (raw: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardSensitiveRead(req, res, ['GET'])) return

  const windowDays = clampInt(req.query.days, 1, 90, DEFAULT_WINDOW_DAYS)
  const limit = clampInt(req.query.limit, 1, 24, 8)

  try {
    const candidates = await collectSeedCandidates(supabase, { windowDays, limit })
    return res.json({
      ok: true,
      window_days: windowDays,
      generated_at: new Date().toISOString(),
      candidates,
    })
  } catch (error) {
    console.error('content seed collection failed', error)
    return res.status(500).json({ ok: false, error: 'seed_collection_failed' })
  }
}
