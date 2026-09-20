// The Content Engine's schedule, as the dashboard knows it.
//
// One row per scheduled job: the cron path, how often it is meant to succeed,
// and how long past that we wait before saying something.
//
// THIS LIST IS A SECOND COPY AND NOTHING GUARDS IT. The header used to claim
// `scripts/check-content-engine-schedule.mts` held it and vercel.json to the
// same set. That file does not exist in this repository. The guard is real but
// it lives in the other one, as
// `content-engine/apps/control-plane/scripts/check-content-engine-schedule.ts`,
// and it reads that repo's own `lib/contentEngineSchedule.ts` against that
// repo's `vercel.json`. Since ADR-019 moved the crons, none of the paths below
// is a cron in THIS repo's vercel.json at all, so no local guard could check
// them; the two lists agreed job-for-job when last compared (17 each,
// 2026-09-20) and only a human keeps them that way.
//
// So: a cron added in content-engine and not added here goes quiet invisibly,
// and one removed there keeps being nagged about here. Change one, change both.
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
  /** Who fires it. 'cron' (default) is a vercel.json cron; 'external' is a
   *  machine outside this repo POSTing in (the AEO engine on GitHub Actions).
   *  An external job has no cron entry, but its silence is still said here. */
  trigger?: 'cron' | 'external'
  /**
   * True when having no work is this lane's NORMAL state, so a run of skips is
   * health and not silence.
   *
   * This is per job on purpose, because the honest answer differs. `feed_ingest`
   * skipping "nothing new" for two days may well mean the feed is broken, and
   * `tests/api/runs.test.ts` deliberately pins it as stale. The Drive scan and
   * the learning compiler are the opposite: they are *supposed* to sit idle for
   * weeks and say so, and treating that as staleness is what put two false
   * alarms on Krish's screen on 2026-09-17.
   */
  starvationIsNormal?: boolean
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
  { job: 'learning_compile', path: '/api/learning/compile',              label: 'Learning compiler',     everyHours: WEEK, graceHours: DAY, starvationIsNormal: true },
  // Runs every two hours, but a quiet day is still a quiet day: the
  // expectation is a success daily, not that Krish saves something twelve
  // times. Input starvation is the lane's normal state, not a failure.
  { job: 'inspiration_scan', path: '/api/inspiration/drive-scan',        label: 'Drive inspiration scan', everyHours: DAY,  graceHours: 12, starvationIsNormal: true },
  { job: 'aeo_ingest',       path: '/api/aeo/ingest',                    label: 'AEO research',          everyHours: WEEK, graceHours: DAY, trigger: 'external' },
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

/**
 * Which jobs need saying.
 *
 * A RUN THAT SKIPPED IS A RUN THAT WORKED. The ledger has said this since it
 * was created — `content_engine_runs.status` is
 * `check (status in ('ok','skipped','failed'))`, and that migration's own header
 * names the cases it was built for: "a cron that skipped itself (pool not
 * configured, corpus too thin, nothing to surface)". This function used to
 * count only `'ok'` toward recency, so a lane whose normal state is input
 * starvation had its clock frozen, crossed its staleness allowance, and was
 * reported as stale — with the skip reason, a sentence written to explain a
 * deliberate no-op, appended as "(last run: …)" so it read as a fault.
 *
 * That is how "Learning compiler has never succeeded (last run: only 1 edit
 * events in 28 days: too thin to propose anything)" reached Krish's screen. The
 * compiler ran, correctly judged one edit event too thin to learn from, and said
 * so. Nothing was broken. Same for the Drive scan, whose own entry below already
 * says "input starvation is the lane's normal state, not a failure".
 *
 * Ruling (Krish, 2026-09-17): a job that runs and finds nothing to do says
 * NOTHING AT ALL. Silence is the report. So `skipped` counts as healthy here and
 * never reaches a surface.
 *
 * What DOES need saying is a job with no rows at all. That is a cron that never
 * fired, which is the silent failure this ledger exists to catch, and it used to
 * be counted into `unrecorded` and then never rendered by anything.
 */
export function contentEngineAttention(rows: ContentEngineRunRow[], now: Date = new Date()): {
  attention: ContentEngineAttention[]
  unrecorded: number
} {
  const newest = new Map<string, ContentEngineRunRow>()
  const newestOk = new Map<string, ContentEngineRunRow>()
  const newestRan = new Map<string, ContentEngineRunRow>()
  for (const row of rows) {
    if (!newest.has(row.job)) newest.set(row.job, row)
    if (row.status === 'ok' && !newestOk.has(row.job)) newestOk.set(row.job, row)
    // 'ok' did the work, 'skipped' decided there was none. Both prove the job
    // is still firing, which is the only question a starvation-normal lane is
    // being asked.
    if ((row.status === 'ok' || row.status === 'skipped') && !newestRan.has(row.job)) {
      newestRan.set(row.job, row)
    }
  }
  const attention: ContentEngineAttention[] = []
  let unrecorded = 0
  for (const job of CONTENT_ENGINE_JOBS) {
    const last = newest.get(job.job)
    // Counted, never shouted per job. Seventeen crons that have never reported
    // is a new deployment, not seventeen separate emergencies, and the original
    // note here was right to say so. What was wrong is that `unrecorded` was
    // returned and then rendered by nothing at all — so a cron that genuinely
    // stopped firing was invisible. It is ONE line now, at the caller.
    if (!last) { unrecorded += 1; continue }
    // Which clock this lane is judged on. Most jobs are judged on SUCCEEDING,
    // because a long run of skips is itself the symptom. A lane whose normal
    // state is having no input is judged on RUNNING, because for it a skip is
    // the correct outcome and not a missed success.
    const healthy = job.starvationIsNormal ? newestRan.get(job.job) : newestOk.get(job.job)
    const allowanceMs = (job.everyHours + job.graceHours) * 3_600_000
    const healthyAge = healthy ? now.getTime() - Date.parse(healthy.finished_at) : Number.POSITIVE_INFINITY
    if (last.status === 'failed') {
      attention.push({
        job: job.job, label: job.label, kind: 'failed',
        line: `${job.label} failed on its last run${last.reason ? `: ${last.reason}` : ''}.`,
      })
    } else if (healthyAge > allowanceMs) {
      const days = Math.floor(healthyAge / 86_400_000)
      const what = job.starvationIsNormal ? 'run' : 'succeeded'
      attention.push({
        job: job.job, label: job.label, kind: 'stale',
        // No `(last run: …)` clause. That is where a skip's own explanation —
        // a sentence about there being nothing to do — used to be pasted onto a
        // staleness warning and read as a fault diagnosis.
        line: healthy
          ? `${job.label} has not ${what} in ${days} day${days === 1 ? '' : 's'}.`
          : `${job.label} has never ${what}.`,
      })
    }
  }
  return { attention, unrecorded }
}
