import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from './_auth.js'
import { supabase } from './_supabase.js'
import { researchBrief } from './_enrich.js'

// GET /api/discover-visibility-targets   cron, 0 9 * * 2 (vercel.json)
//
// The outbound half of Visibility (stages, calls for papers, press) had no
// schedule at all: targets arrived by paste and were deep-enriched by hand,
// last on 2026-06-18. This does the two things a schedule can do honestly:
// a queued target whose date has passed is dropped with the reason, and the
// oldest queued targets with no research in 60 days get a fresh brief. It
// sources nothing new by itself; the import doors and the guest scout do.

export const config = { maxDuration: 300 }

const BATCH = 5
const STALE_DAYS = 60

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (guardCronRoute(req, res)) return

  const now = new Date()
  const dropped: string[] = []
  const refreshed: string[] = []
  const failed: { id: string; error: string }[] = []
  try {
    const { data: past, error: pErr } = await supabase
      .from('visibility_targets')
      .select('id, title, deadline_at, event_start_at')
      .in('status', ['sourced', 'queued'])
      .or(`deadline_at.lt.${now.toISOString()},event_start_at.lt.${now.toISOString()}`)
    if (pErr) throw new Error(pErr.message)
    for (const t of past || []) {
      const { error } = await supabase.from('visibility_targets').update({
        status: 'dropped',
        rejected_at: now.toISOString(),
        next_actions: 'Dropped by the Tuesday refresh: the date has passed.',
      }).eq('id', t.id)
      if (error) failed.push({ id: t.id as string, error: error.message.slice(0, 120) })
      else dropped.push(t.title as string)
    }

    const cutoff = new Date(now.getTime() - STALE_DAYS * 24 * 3600 * 1000).toISOString()
    const { data: stale, error: sErr } = await supabase
      .from('visibility_targets')
      .select('id, title, source_url, event_url, why_relevant, raw_data, deep_enriched_at')
      .in('status', ['sourced', 'queued'])
      .or(`deep_enriched_at.is.null,deep_enriched_at.lt.${cutoff}`)
      .order('deadline_at', { ascending: true, nullsFirst: false })
      .limit(BATCH)
    if (sErr) throw new Error(sErr.message)
    for (const t of stale || []) {
      try {
        const { summary, sources } = await researchBrief({
          kind: 'event',
          name: (t.title as string) || '',
          url: (t.source_url as string) || (t.event_url as string),
          extra: t.why_relevant as string,
        })
        const raw = (t.raw_data && typeof t.raw_data === 'object') ? t.raw_data as Record<string, unknown> : {}
        const { error } = await supabase.from('visibility_targets').update({
          deep_enriched_at: now.toISOString(),
          why_relevant: (t.why_relevant as string) || summary,
          raw_data: { ...raw, direct_research: { summary, sources, at: now.toISOString() } },
        }).eq('id', t.id)
        if (error) throw new Error(error.message)
        refreshed.push(t.title as string)
      } catch (e: unknown) {
        failed.push({ id: t.id as string, error: (e as Error)?.message?.slice(0, 120) || 'refresh_failed' })
      }
    }

    await supabase.from('workflow_runs').insert({
      workflow_id: 'discover-visibility-targets',
      workflow_name: 'Visibility target refresh',
      agent_id: 'nova',
      run_at: now.toISOString(),
      duration_ms: Date.now() - now.getTime(),
      outcome: `${dropped.length} past-date target(s) dropped, ${refreshed.length} refreshed, ${failed.length} failed`,
      outcome_count: dropped.length + refreshed.length,
      status: failed.length && !refreshed.length && !dropped.length ? 'error' : 'success',
      metadata: { dropped: dropped.length, refreshed: refreshed.length, failed: failed.length },
    })
    return res.status(200).json({ ok: true, dropped, refreshed, failed })
  } catch (e: unknown) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'refresh_failed'
    return res.status(500).json({ ok: false, error: msg, dropped, refreshed, failed })
  }
}
