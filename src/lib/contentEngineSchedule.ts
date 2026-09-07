// The Content Engine's schedule, as the dashboard knows it.
//
// One row per scheduled job: the cron path in vercel.json, how often it is
// meant to succeed, and how long past that we wait before saying something.
// scripts/check-content-engine-schedule.mts holds this list and vercel.json
// to the same set, so a cron added or removed on one side fails the build.
//
// The rows are read against content_engine_runs (api/_runs.ts) to produce
// attention lines in the obligation strip. The OS is pull-only: a stale job
// is said here, on the tab Krish opens, and nowhere else.

export interface ContentEngineJob {
  job: string
  path: string
  label: string
  /** How often a success is expected, in hours. */
  everyHours: number
  /** How long past the expectation we stay quiet, in hours. */
  graceHours: number
}

const DAY = 24
const WEEK = 24 * 7

export const CONTENT_ENGINE_JOBS: ContentEngineJob[] = [
  { job: 'feed_ingest',      path: '/api/feed/ingest',                   label: 'Feed ingest',           everyHours: DAY,  graceHours: 12 },
  { job: 'editorial_radar',  path: '/api/content-opportunities/refresh', label: 'Editorial radar',       everyHours: DAY,  graceHours: 12 },
  { job: 'triage_sweep',     path: '/api/triage/sweep',                  label: 'Triage sweep',          everyHours: DAY,  graceHours: 12 },
  { job: 'content_cluster',  path: '/api/content-ideas/cluster',         label: 'Draft clustering',      everyHours: DAY,  graceHours: 12 },
  { job: 'archive_stale',    path: '/api/content-ideas/archive-stale',   label: 'Stale idea archive',    everyHours: DAY,  graceHours: 12 },
  { job: 'lens_radar',       path: '/api/discover-lens-radar',           label: 'Lens radar',            everyHours: WEEK, graceHours: DAY },
  { job: 'creator_posts',    path: '/api/discover-creator-posts',        label: 'Creator scout',         everyHours: WEEK, graceHours: DAY },
  { job: 'build_signals',    path: '/api/discover-build-signals',        label: 'Build signals',         everyHours: WEEK, graceHours: DAY },
  { job: 'investigations',   path: '/api/investigations/run',            label: 'Investigations',        everyHours: WEEK, graceHours: DAY },
  { job: 'shifts_detect',    path: '/api/shifts/detect',                 label: 'Shift detection',       everyHours: WEEK, graceHours: DAY },
  { job: 'arcs_surface',     path: '/api/arcs/surface',                  label: 'Weekly surfacing',      everyHours: WEEK, graceHours: DAY },
  { job: 'briefs_assemble',  path: '/api/briefs/assemble',               label: 'Weekly brief',          everyHours: WEEK, graceHours: DAY },
  { job: 'purge',            path: '/api/purge/run',                     label: 'Monday purge',          everyHours: WEEK, graceHours: DAY },
  { job: 'runner_watch',     path: '/api/video-studio/runner/watch',     label: 'Studio runner watch',   everyHours: DAY,  graceHours: 12 },
]

export interface ContentEngineRunRow {
  job: string
  status: 'ok' | 'skipped' | 'failed'
  reason: string | null
  finished_at: string
}

export interface ContentEngineAttention {
  job: string
  label: string
  /** What is wrong, in one plain sentence. */
  line: string
  kind: 'failed' | 'stale'
}

/** Which jobs need saying. Reads newest-first rows; ignores jobs that have no
 *  history at all, because a brand-new ledger is not fourteen failures. */
export function contentEngineAttention(rows: ContentEngineRunRow[], now: Date = new Date()): {
  attention: ContentEngineAttention[]
  unrecorded: number
} {
  const newest = new Map<string, ContentEngineRunRow>()
  const newestOk = new Map<string, ContentEngineRunRow>()
  for (const row of rows) {
    if (!newest.has(row.job)) newest.set(row.job, row)
    if (row.status === 'ok' && !newestOk.has(row.job)) newestOk.set(row.job, row)
  }
  const attention: ContentEngineAttention[] = []
  let unrecorded = 0
  for (const job of CONTENT_ENGINE_JOBS) {
    const last = newest.get(job.job)
    if (!last) { unrecorded += 1; continue }
    const ok = newestOk.get(job.job)
    const allowanceMs = (job.everyHours + job.graceHours) * 3_600_000
    const okAge = ok ? now.getTime() - Date.parse(ok.finished_at) : Number.POSITIVE_INFINITY
    if (last.status === 'failed') {
      attention.push({
        job: job.job, label: job.label, kind: 'failed',
        line: `${job.label} failed on its last run${last.reason ? `: ${last.reason}` : ''}.`,
      })
    } else if (okAge > allowanceMs) {
      const days = Math.floor(okAge / 86_400_000)
      attention.push({
        job: job.job, label: job.label, kind: 'stale',
        line: ok
          ? `${job.label} has not succeeded in ${days} day${days === 1 ? '' : 's'}${last.reason ? ` (last run: ${last.reason})` : ''}.`
          : `${job.label} has never succeeded${last.reason ? ` (last run: ${last.reason})` : ''}.`,
      })
    }
  }
  return { attention, unrecorded }
}
