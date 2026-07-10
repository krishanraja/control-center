import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { isoWeekLabel } from '../_weeks.js'

// The Monday purge (Content Engine v2, spec §4). Mon 14:00 UTC, after send.
//
// R10: hard delete, no cold archive. Every time-sensitive item meets one of
// three fates and this cron enforces the first:
//   1. EXPIRES  — news-horizon rows past expires_at with no shift and no
//                 library stamp are DELETED. The 200-card pile is structurally
//                 impossible because nothing news-shaped survives its week.
//   2. FEEDS A SHIFT — rows with shift_id are kept (their evidence already
//                 lives in the dossier; the row keeps the Feed history light).
//   3. GRADUATES — rows with library_at are kept forever.
// Also archives last week's brief once it was pushed/sent, and writes the
// purge stats to audit_log so the deletion is observable after the fact.
//
//   GET (CRON_SECRET) — Mon 14:00 UTC   ·   POST — manual

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
  } else if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })
  }

  try {
    const nowIso = new Date().toISOString()

    // Fate 1: expire. Count first so the audit row is honest even though the
    // rows are gone afterwards.
    const expiredQuery = () => supabase
      .from('content_ideas')
      .select('id', { count: 'exact', head: true })
      .not('expires_at', 'is', null)
      .lte('expires_at', nowIso)
      .is('shift_id', null)
      .is('library_at', null)
    const { count: toExpire } = await expiredQuery()

    let expired = 0
    if (toExpire) {
      const { error: delErr, count } = await supabase
        .from('content_ideas')
        .delete({ count: 'exact' })
        .not('expires_at', 'is', null)
        .lte('expires_at', nowIso)
        .is('shift_id', null)
        .is('library_at', null)
      if (delErr) throw new Error(delErr.message)
      expired = count ?? 0
    }

    // Archive pushed/sent briefs from previous weeks.
    const week = isoWeekLabel()
    const { data: archived } = await supabase
      .from('weekly_briefs')
      .update({ status: 'archived', purge_ran_at: nowIso })
      .neq('week', week)
      .in('status', ['pushed', 'sent'])
      .select('week')

    // Sweep stale pending purge_preview decisions (their moment has passed).
    await supabase.from('content_decisions')
      .update({ status: 'done', resolved_at: nowIso, resolution: { action: 'purge_ran' } })
      .eq('kind', 'purge_preview')
      .eq('status', 'pending')
      .neq('week', week)

    await supabase.from('audit_log').insert({
      event_type: 'content_purge',
      actor: 'content-engine-v2',
      details: { week, expired, briefs_archived: (archived || []).map(a => a.week) },
    })

    return res.json({ ok: true, week, expired, briefs_archived: (archived || []).length })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
