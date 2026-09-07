import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../../_auth.js'
import { supabase } from '../../_supabase.js'
import { withContentRun } from '../../_runs.js'

// GET /api/video-studio/runner/watch   daily
//
// The only media executor is a hidden Scheduled Task on one Windows machine.
// Its heartbeat lease is two minutes, so a dead runner shows as "offline" on
// a review card, and nothing else. This watch turns a silent runner into a
// ledger row when there is work waiting for it: queued commands, pending
// reviews, or approved production briefs. The row surfaces in the Content
// tab's obligation strip through the same path as every other stale job.
//
// It never wakes anything. The OS is pull-only; the fix is on the machine.

const SILENT_AFTER_HOURS = 24

async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const now = Date.now()

  const [heartbeat, commands, reviews, briefs] = await Promise.all([
    supabase.from('video_studio_runner_heartbeats').select('occurred_at, runner_status, drive_state').order('occurred_at', { ascending: false }).limit(1),
    supabase.from('video_studio_commands').select('id', { count: 'exact', head: true }).in('status', ['queued', 'leased']),
    supabase.from('video_studio_review_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('content_ideas').select('id, meta').eq('state', 'approved').not('meta->production_brief', 'is', null).limit(200),
  ])
  for (const result of [heartbeat, commands, reviews, briefs]) {
    if (result.error) return res.status(503).json({ ok: false, error: `runner watch read failed: ${result.error.message}` })
  }

  const last = heartbeat.data?.[0] || null
  const silentHours = last ? (now - Date.parse(last.occurred_at)) / 3_600_000 : null
  let readyBriefs = 0
  let expiredLeases = 0
  for (const row of briefs.data || []) {
    const envelope = (row.meta as Record<string, unknown> | null)?.production_brief as Record<string, unknown> | undefined
    const status = envelope?.status
    if (status === 'ready_for_studio') readyBriefs += 1
    else if (status === 'leased') {
      const lease = envelope?.lease as Record<string, unknown> | undefined
      const expiresAt = typeof lease?.expires_at === 'string' ? Date.parse(lease.expires_at) : NaN
      if (Number.isFinite(expiresAt) && now > expiresAt) expiredLeases += 1
    }
  }

  const waiting = (commands.count || 0) + (reviews.count || 0) + readyBriefs + expiredLeases
  const silent = silentHours === null || silentHours > SILENT_AFTER_HOURS
  const counts = {
    queued_commands: commands.count || 0,
    pending_reviews: reviews.count || 0,
    ready_briefs: readyBriefs,
    expired_brief_leases: expiredLeases,
    silent_hours: silentHours === null ? -1 : Math.round(silentHours),
  }

  if (silent && waiting > 0) {
    // ok:false makes this a failed run in the ledger, which is the point.
    return res.status(200).json({
      ok: false,
      error: last
        ? `runner silent for ${Math.round(silentHours!)} hours with ${waiting} item${waiting === 1 ? '' : 's'} waiting`
        : `runner has never sent a heartbeat and ${waiting} item${waiting === 1 ? '' : 's'} are waiting`,
      ...counts,
    })
  }
  if (silent) return res.status(200).json({ ok: true, skipped: 'runner silent, nothing waiting for it', ...counts })
  return res.status(200).json({ ok: true, drive_state: last?.drive_state, runner_status: last?.runner_status, ...counts })
}

export default withContentRun('runner_watch', handler)
