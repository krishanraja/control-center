import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// Hunter runs Monday and Thursday as a scheduled cloud session, not a
// daemon. Nothing listens between runs, so this route is observation only:
// it answers "is it alive, and what is waiting on me" and points the
// waiting work at the sheet, which is where verdicts are actually given.

export const config = { maxDuration: 30 }

const AGENT_ID = 'hunter'
const RUN_DAYS_UTC = [1, 4]   // cron 27 8 * * 1,4
// Mirrors router.py GO_WORDS. Every other verdict is either "applied" or
// Krish's free-text rejection, and counting those as approved would promise
// packages that will never build.
const GO_WORDS = new Set(['go', 'y', 'yes'])
const RUN_HOUR_UTC = 8
const RUN_MINUTE_UTC = 27

export function nextFireUtc(from: Date): string {
  const next = new Date(from)
  next.setUTCSeconds(0, 0)
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(next)
    candidate.setUTCDate(next.getUTCDate() + i)
    candidate.setUTCHours(RUN_HOUR_UTC, RUN_MINUTE_UTC, 0, 0)
    if (RUN_DAYS_UTC.includes(candidate.getUTCDay()) && candidate > from) {
      return candidate.toISOString()
    }
  }
  return ''
}

async function countRoles(filter: (q: any) => any): Promise<number | null> {
  const { count, error } = await filter(
    supabase.from('hunter_seen_roles').select('job_id', { count: 'exact', head: true }),
  )
  return error ? null : count ?? 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return

  try {
    const [lastRun, alert, waiting, approved, built] = await Promise.all([
      supabase
        .from('workflow_runs')
        .select('run_at, status, outcome, cost_usd, duration_ms, error_message, metadata')
        .eq('agent_id', AGENT_ID)
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('silent_failures')
        .select('failure_type, detail, detected_at, run_count')
        .eq('workflow_id', 'hunter-run')
        .is('resolved_at', null)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      countRoles(q => q.in('status', ['staging', 'presented']).is('krish_verdict', null)),
      supabase
        .from('hunter_seen_roles')
        .select('krish_verdict')
        .in('package_status', ['none', 'queued'])
        .not('krish_verdict', 'is', null),
      countRoles(q => q.eq('package_status', 'built')),
    ])
    if (lastRun.error) throw new Error(lastRun.error.message)
    const approvedCount = approved.error
      ? null
      : (approved.data || []).filter((r: { krish_verdict: string | null }) =>
          GO_WORDS.has((r.krish_verdict || '').trim().toLowerCase())).length

    return res.status(200).json({
      ok: true,
      lastRun: lastRun.data || null,
      alert: alert.data || null,
      waitingOnKrish: waiting,
      approvedAwaitingBuild: approvedCount,
      packagesBuilt: built,
      nextFireUtc: nextFireUtc(new Date()),
    })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'status_failed' })
  }
}
