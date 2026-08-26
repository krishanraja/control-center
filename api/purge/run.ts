import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { isoWeekLabel, queueWindowStart } from '../_weeks.js'

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
// Also ages out the weekly surfaces so the Content tab stays a week's worth of
// work rather than a growing pile: every brief past its week is archived
// (whatever state it reached), and every decision card past its week is swept
// to 'archived'. Both used to be filtered so narrowly that they never fired -
// see the notes at each. Purge stats go to audit_log so it is observable.
//
//   GET (CRON_SECRET) — Mon 14:00 UTC   ·   POST — manual

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  try {
    const nowIso = new Date().toISOString()

    // Fate 1: expire. Count first so the audit row is honest even though the
    // rows are gone afterwards.
    // Safety floor: a row Krish has started working (drafting or beyond) is
    // never hard-deleted by expiry, even if its expires_at was set while it
    // was still a seed (temporal-class expiry, 2026-07-27).
    const expiredQuery = () => supabase
      .from('content_ideas')
      .select('id', { count: 'exact', head: true })
      .not('expires_at', 'is', null)
      .lte('expires_at', nowIso)
      .is('shift_id', null)
      .is('library_at', null)
      .not('state', 'in', '("drafting","review","approved","published")')
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
        .not('state', 'in', '("drafting","review","approved","published")')
      if (delErr) throw new Error(delErr.message)
      expired = count ?? 0
    }

    // Archive every brief whose week has passed, not just the ones that shipped.
    //
    // This used to filter .in('status', ['pushed','sent']), which reads as
    // "archive what we sent" but behaves as "archive nothing": across the
    // eight runs to 2026-08-24 the audit rows all say briefs_archived: [], and
    // no brief in the table has ever had a pushed_at or sent_at. So a brief
    // that was assembled and then not pushed - which is all seven of them -
    // stayed 'ready'/'in_review'/'approved' forever, and useContentV2's hero
    // read (which accepts exactly those statuses) kept serving it.
    //
    // A weekly brief is news-shaped: R10 says nothing news-shaped survives its
    // week. Past its week it is archived whatever state it reached. 'approved'
    // is included deliberately - 2026-W30 has sat approved-but-never-pushed
    // since 24 July, and exempting it is what made it immortal. Archiving is
    // not deletion: the row, its body and its versions all stay readable.
    //
    // The boundary is the start of the deck's read window, not the current
    // week. Archiving at `< week` would bury Friday's brief on Monday and
    // leave the tab with no brief at all until the next Friday; this way the
    // brief stays readable until its successor arrives.
    const week = isoWeekLabel()
    const windowStart = queueWindowStart()
    const { data: archived } = await supabase
      .from('weekly_briefs')
      .update({ status: 'archived', purge_ran_at: nowIso })
      .lt('week', windowStart)
      .in('status', ['ready', 'in_review', 'approved', 'pushed', 'sent'])
      .select('week')

    // Sweep EVERY stale pending decision, not just purge_preview.
    //
    // The old sweep was .eq('kind','purge_preview'), so brief_review,
    // shift_proposal, shift_fading, graduation and investigation cards had no
    // ageing path at all - the only thing that ever cleared one was Krish
    // tapping it. On 2026-08-25 that was 74 pending rows going back to 10 July,
    // against a spec that calls for 5-10 a week.
    //
    // The rule is "sweep only what has already scrolled out of view": the
    // boundary is the start of the deck's read window, so a card is assembled
    // Friday, stays reviewable for the rest of that week and all of the next,
    // and is swept on the Monday after it stops being visible. Nothing is ever
    // cleared out from under Krish while it is still on screen.
    //
    // 'archived', not 'dismissed': nothing was judged here, so nothing should
    // teach, and nothing should later read as a rejection. 'dismissed' means
    // Krish ruled on it; this means the week passed and he never saw it. The
    // rows keep their full payload and their ref, so the archive stays useful
    // for comparing what the engine produced against what he chose.
    //
    // purge_preview keeps the tighter `< week` boundary below: a card that says
    // "expiring Monday" is misinformation the moment that Monday has passed.
    const { data: sweptRows } = await supabase.from('content_decisions')
      .update({
        status: 'archived',
        resolved_at: nowIso,
        resolution: { action: 'expired_unreviewed', at: nowIso, swept_by: 'purge/run' },
      })
      .eq('status', 'pending')
      .neq('kind', 'purge_preview')
      .lt('week', windowStart)
      .select('kind')

    const { data: sweptPreviews } = await supabase.from('content_decisions')
      .update({ status: 'done', resolved_at: nowIso, resolution: { action: 'purge_ran', at: nowIso } })
      .eq('status', 'pending')
      .eq('kind', 'purge_preview')
      .lt('week', week)
      .select('kind')

    const swept = [...(sweptRows || []), ...(sweptPreviews || [])].reduce<Record<string, number>>((acc, r: any) => {
      acc[r.kind] = (acc[r.kind] || 0) + 1
      return acc
    }, {})

    await supabase.from('audit_log').insert({
      event_type: 'content_purge',
      actor: 'content-engine-v2',
      details: {
        week, expired,
        briefs_archived: (archived || []).map(a => a.week),
        decisions_swept: (sweptRows || []).length + (sweptPreviews || []).length,
        swept_by_kind: swept,
      },
    })

    return res.json({
      ok: true, week, expired,
      briefs_archived: (archived || []).length,
      decisions_swept: (sweptRows || []).length + (sweptPreviews || []).length,
      swept_by_kind: swept,
    })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
