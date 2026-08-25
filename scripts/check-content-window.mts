// Guards the Content queue's week window against drift.
//
// The Content tab was ~74 pending decision cards deep, going back to 2026-W28,
// because the read path had no week bound at all: `.eq('status','pending')
// .order('created_at', asc).limit(30)` served the thirty OLDEST cards ever
// written, so the same 10 July brief review sat at slot 1 for six weeks and
// nothing from W32-W34 could be reached. Nothing aged the rows out either -
// api/purge/run.ts swept only kind='purge_preview'.
//
// The fix bounds both halves by the same window, which means the window is now
// defined twice: once for the browser (src/lib/contentV2.ts, which cannot
// import from api/ - separate tsconfig) and once for the cron (api/_weeks.ts).
// The ageing rule is "sweep only what has already scrolled out of view", so if
// those two definitions drift the purge starts clearing cards that are still on
// screen, or stops clearing ones that are not. Neither failure is visible until
// a card goes missing mid-read.
//
// This guard therefore checks:
//   1. both spans are declared and equal
//   2. both window functions agree on every week across a multi-year sweep
//      (including the ISO year boundary, where '2025-W52' must precede
//      '2026-W01' lexicographically for the .lt()/.gte() bounds to work)
//   3. the queue read still carries a week bound at all
//   4. the purge still sweeps kinds beyond purge_preview
//
//   npx tsx scripts/check-content-window.mts
import { readFileSync } from 'node:fs'
import { isoWeekLabel as clientLabel, earliestQueueWeek, QUEUE_WEEK_SPAN } from '../src/lib/contentV2.ts'
import { isoWeekLabel as apiLabel, queueWindowStart, QUEUE_WEEK_SPAN as API_SPAN } from '../api/_weeks.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

// 1. The spans must match.
if (QUEUE_WEEK_SPAN !== API_SPAN) {
  bad(`week span drift: src/lib/contentV2.ts says ${QUEUE_WEEK_SPAN}, api/_weeks.ts says ${API_SPAN}`)
}

// 2. Both implementations must agree on every week, and labels must sort.
{
  let prev = ''
  for (let i = 0; i < 1200; i++) {
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000)
    const c = clientLabel(d)
    const a = apiLabel(d)
    if (c !== a) { bad(`week label drift on ${d.toISOString().slice(0, 10)}: client ${c}, api ${a}`); break }
    if (earliestQueueWeek(QUEUE_WEEK_SPAN, d) !== queueWindowStart(API_SPAN, d)) {
      bad(`window start drift on ${d.toISOString().slice(0, 10)}: client ${earliestQueueWeek(QUEUE_WEEK_SPAN, d)}, api ${queueWindowStart(API_SPAN, d)}`)
      break
    }
    // The bounds are string comparisons in Postgres, so the labels have to be
    // monotonic as text or .lt()/.gte() silently select the wrong rows.
    if (prev && c < prev) { bad(`week labels not lexicographically monotonic: ${prev} then ${c}`); break }
    prev = c
  }
}

// 3. The queue read must stay bounded. Losing this line is the original bug.
{
  const hook = readFileSync('src/hooks/useContentV2.ts', 'utf8')
  if (!/earliestQueueWeek\s*\(/.test(hook) || !/\.gte\(\s*['"]week['"]/.test(hook)) {
    bad('src/hooks/useContentV2.ts no longer bounds the decision read by week — the queue becomes an all-time backlog again')
  }
  if (/\.order\(\s*['"]created_at['"]\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/.test(hook)) {
    bad('src/hooks/useContentV2.ts orders decisions oldest-first again — a truncated queue then hides everything recent')
  }
}

// 4. The purge must keep ageing kinds other than purge_preview.
{
  const purge = readFileSync('api/purge/run.ts', 'utf8')
  if (!/queueWindowStart\s*\(/.test(purge)) {
    bad('api/purge/run.ts no longer uses queueWindowStart — its boundary and the deck\'s window can now disagree')
  }
  if (!/\.neq\(\s*['"]kind['"]\s*,\s*['"]purge_preview['"]\s*\)/.test(purge)) {
    bad('api/purge/run.ts no longer sweeps decision kinds beyond purge_preview — brief_review cards go immortal again')
  }
  // An aged-out card must not land in the same bucket as one Krish ruled on:
  // 'dismissed' is a judgement, 'archived' is a timeout, and a comparison that
  // conflates them counts the engine's unreviewed output as his rejections.
  if (!/status:\s*['"]archived['"]/.test(purge)) {
    bad("api/purge/run.ts no longer sweeps to 'archived' — timed-out cards would read as Krish's rejections")
  }
}

console.log(fail === 0
  ? 'PASS  one week window, client and cron agree, queue bounded, all kinds aged'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
