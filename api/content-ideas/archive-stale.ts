import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// Daily staleness archive for the content backlog.
//
// The Monday purge (api/purge/run.ts) deletes news-horizon rows past expires_at,
// but it exempts drafting/review/approved/published so work Krish started is
// never hard-deleted. The gap that left: an idea promoted out of 'seeded' and
// then abandoned is immortal. On 2026-08-19 that was 48 of 49 drafting rows
// expired (avg 31 days old) and 9 of 9 review rows expired (avg 70 days, oldest
// 74) — half the pile Krish opens each morning was months stale.
//
// This is deliberately NOT expiry-based. expires_at is set from a seed's
// temporal class, which is a guess about the story, not a measure of Krish's
// neglect. It is also not updated_at-based: background re-scoring sweeps touch
// rows constantly, so those 74-day-old review items reported "touched 8 days
// ago" and nothing looked idle. The signal is content_ideas.state_changed_at,
// moved only by a real state transition.
//
// Archive, never delete: the row keeps its evidence and, per the same-day change
// to api/shifts/detect.ts, keeps feeding the trend corpus. Krish stops seeing
// it; the OS keeps learning from it.
//
//   GET (CRON_SECRET) — daily 13:00 UTC   ·   POST — manual
//   POST { dry_run: true } previews without burying anything.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  let dryRun = false
  let days: number | null = null

  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
  } else if (req.method === 'POST') {
    const body = (req.body || {}) as { dry_run?: boolean; days?: number }
    dryRun = body.dry_run === true
    days = typeof body.days === 'number' ? body.days : null
  } else {
    return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })
  }

  try {
    const { data, error } = await supabase.rpc('archive_stale_content_ideas', {
      p_days: days,
      p_dry_run: dryRun,
    })
    if (error) throw new Error(error.message)

    const result = (data || {}) as { archived?: number; would_archive?: number; idle_days_threshold?: number }

    if (!dryRun && (result.archived ?? 0) > 0) {
      await supabase.from('audit_log').insert({
        event_type: 'content_staleness_archive',
        actor: 'content-engine-v2',
        target: 'content_ideas',
        details: JSON.stringify({
          archived: result.archived,
          idle_days_threshold: result.idle_days_threshold,
        }),
      })
    }

    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
