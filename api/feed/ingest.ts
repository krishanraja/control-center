import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { fetchPoolDays, poolConfigured } from '../_pool.js'
import { purgeBoundary } from '../_weeks.js'

// Daily Feed ingest (Content Engine v2, spec §4).
//
// Pulls the last two days of the CTRL corroborated headlines pool into
// content_ideas as ambient Feed rows: horizon='news', source_type='pool_headline',
// expires_at = the coming Monday 14:00 UTC purge boundary. The Feed carries zero
// obligations; these rows exist so the weekly shift detection and brief assembly
// have a lived, dated corpus, and so the Feed room can show what was read.
//
//   GET (CRON_SECRET)  — daily 11:30 UTC (after the pool's 10:30 prewarm)
//   POST               — on-demand backstop
//
// Newsletters keep arriving via the n8n Inspiration Sweep; Zara via her sweep.

const LOOKBACK_DAYS = 2

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  if (!poolConfigured()) {
    return res.status(200).json({ ok: true, skipped: 'pool not configured (CTRL_SUPABASE_URL / CTRL_SUPABASE_SERVICE_KEY unset)' })
  }

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
    const { days, stories } = await fetchPoolDays(since)
    if (!stories.length) return res.json({ ok: true, days, fetched: 0, inserted: 0 })

    // Dedupe by URL (primary) and normalized headline (fallback) against the
    // last 14 days of pool-sourced rows.
    const sinceISO = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const { data: existing, error: exErr } = await supabase
      .from('content_ideas')
      .select('source_url, title_norm')
      .eq('source_type', 'pool_headline')
      .gte('created_at', sinceISO)
      .limit(3000)
    if (exErr) throw new Error(exErr.message)
    const seenUrls = new Set((existing || []).map(r => r.source_url).filter(Boolean))
    const seenTitles = new Set((existing || []).map(r => r.title_norm).filter(Boolean))

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160)
    const expiresAt = purgeBoundary(new Date()).toISOString()

    const rows: Record<string, unknown>[] = []
    for (const s of stories) {
      const titleNorm = norm(s.headline)
      if ((s.url && seenUrls.has(s.url)) || seenTitles.has(titleNorm)) continue
      if (s.url) seenUrls.add(s.url)
      seenTitles.add(titleNorm)
      rows.push({
        idea: s.headline,
        thesis: s.say,
        source_type: 'pool_headline',
        source_ref: `pool:${s.day}`,
        source_url: s.url,
        source_snippet: s.say,
        source_captured_at: `${s.day}T12:00:00Z`,
        state: 'seeded',
        origin: 'agent',
        horizon: 'news',
        expires_at: expiresAt,
        title_norm: titleNorm,
        meta: { pool: { day: s.day, category: s.category, source: s.source, source_count: s.sourceCount } },
      })
    }

    let inserted = 0
    if (rows.length) {
      const { error: insErr, count } = await supabase
        .from('content_ideas')
        .insert(rows, { count: 'exact' })
      if (insErr) throw new Error(insErr.message)
      inserted = count ?? rows.length
    }
    return res.json({ ok: true, days, fetched: stories.length, inserted })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
