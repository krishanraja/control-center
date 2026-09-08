import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { withContentRun } from '../_runs.js'
import { draftIdea, publishIdea } from '../_geoRun.js'
import { SITE_REPO } from '../_geoRun.js'

// GET /api/geo/weekly, Monday 08:00 UTC
//
// One page a week, chosen, written, checked and staged without being asked.
// This is the loop Krish described: "the engine should just automatically do
// what is needed to ensure the SEO/GEO strategy is constantly improving
// autonomously. Doesn't really need me involved."
//
// Which means the interesting design question is not how it runs. It is what
// has to be true for it to run unattended for months without doing damage or,
// far more likely, without quietly doing nothing.
//
// ONE PAGE, NOT FIFTEEN
//
// The Sunday research run produces three recommendations for each of five
// subjects. Writing all of them would be fifteen pages a week nobody reads and
// a spend nobody sanctioned, and it would flood two product repositories with
// pull requests. It would also destroy the measurement: fifteen pages landing
// at once on overlapping questions makes it impossible to say which one moved
// an answer. So this picks exactly one, the single most winnable across every
// subject, and leaves the rest for later weeks. The backlog is not wasted; it
// is the queue.
//
// THE ALARM MATTERS MORE THAN THE ENGINE
//
// The failure mode of an unattended job is not that it does something wrong.
// It is that it does nothing and says it is fine. There is already a precedent
// in this codebase: the scrape that keeps the creator registry current has
// fetched posts and written zero cards every run since it shipped, recording
// status ok each time, and nothing anywhere said so.
//
// So this job reports honestly. A week with nothing worth writing is 'skipped'
// with the reason in words. But a run of empty weeks is not a quiet success,
// it is a broken pipeline, and after CONSECUTIVE_EMPTY_ALARM of them the job
// reports 'failed' so the Content tab shouts. Silence and success must not
// look the same.
//
// THE VETO, NOT THE GATE
//
// Publishing opens a pull request on the venture's own site repository. Nobody
// has to act for the page to go live. Closing the pull request is the one
// gesture that stops it. That is the whole safety mechanism for the only
// irreversible step in the chain, and it costs nothing when unused.
//
// Bearer AEO_ENGINE_SECRET or the cron secret, and a ledger job.

export const config = { maxDuration: 300 }

type Row = Record<string, any>

/** One page a week. Not per subject, in total. */
const MIN_DAYS_BETWEEN_PAGES = 6

/** After this many consecutive weeks producing nothing, the job stops calling
 *  itself healthy. Three weeks is long enough to ride out a genuinely quiet
 *  research run and short enough that a broken pipeline is caught inside a
 *  month. */
const CONSECUTIVE_EMPTY_ALARM = 3

/** How far back a recommendation can be and still be worth writing. Older than
 *  this and the measured picture it was built on has moved. */
const CANDIDATE_MAX_AGE_DAYS = 35

interface Candidate {
  id: string
  idea: string
  target_query: string
  why: string
  demand: number
  product_slug: string
  created_at: string
}

/** The pick. Demand first, because it is the only proxy for how often the
 *  question gets asked, then freshness. A recommendation with no reason it can
 *  be won is not a candidate at all: there is nothing for the page to argue,
 *  and the drafting step would refuse it anyway. */
export function chooseCandidate(rows: Row[], now = new Date()): Candidate | null {
  const cutoff = now.getTime() - CANDIDATE_MAX_AGE_DAYS * 86_400_000
  const usable = rows
    .map(r => {
      const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Row
      const aeo = (meta.aeo && typeof meta.aeo === 'object' ? meta.aeo : null) as Row | null
      const geo = (meta.geo && typeof meta.geo === 'object' ? meta.geo : null) as Row | null
      return { row: r, meta, aeo, geo }
    })
    .filter(x => x.aeo
      && typeof x.aeo.why_you_can_win === 'string' && x.aeo.why_you_can_win.trim()
      && typeof x.aeo.target_query === 'string' && x.aeo.target_query.trim()
      // Already drafted and staged: not a candidate again.
      && !(x.geo && x.geo.staged_at)
      && SITE_REPO[String(x.aeo.product_slug || '')]
      && new Date(String(x.row.created_at)).getTime() >= cutoff)

  if (!usable.length) return null
  usable.sort((a, b) => {
    const d = (Number(b.aeo!.demand) || 0) - (Number(a.aeo!.demand) || 0)
    if (d !== 0) return d
    return String(b.row.created_at).localeCompare(String(a.row.created_at))
  })
  const best = usable[0]
  return {
    id: String(best.row.id),
    idea: String(best.row.idea || ''),
    target_query: String(best.aeo!.target_query),
    why: String(best.aeo!.why_you_can_win),
    demand: Number(best.aeo!.demand) || 0,
    product_slug: String(best.aeo!.product_slug || ''),
    created_at: String(best.row.created_at),
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.AEO_ENGINE_SECRET || process.env.CRON_SECRET
  const auth = String(req.headers.authorization || '')
  if (secret && auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
  const started = Date.now()
  const now = new Date()
  const dry = req.query.dry === '1' || req.query.dry === 'true'

  try {
    // The rate limit, read from what actually shipped rather than from a
    // counter this job keeps about itself.
    const recent = await supabase.from('geo_predictions')
      .select('id, target_query, predicted_at')
      .gte('predicted_at', new Date(now.getTime() - MIN_DAYS_BETWEEN_PAGES * 86_400_000).toISOString())
      .limit(1)
    if (recent.error) throw new Error(`rate check failed: ${recent.error.message}`)
    if ((recent.data || []).length) {
      const last = (recent.data as Row[])[0]
      return res.status(200).json({
        ok: true, skipped: 'rate_limited',
        reason: `A page went out on ${String(last.predicted_at).slice(0, 10)}, answering "${last.target_query}". One page a week is the rate, so this week is already spent.`,
        ms: Date.now() - started,
      })
    }

    const pool = await supabase.from('content_ideas')
      .select('id, idea, created_at, meta')
      .eq('source_type', 'aeo_signal')
      .is('parent_idea_id', null)
      .is('buried_at', null)
      .not('state', 'in', '("dropped")')
      .order('created_at', { ascending: false })
      .limit(120)
    if (pool.error) throw new Error(`candidate read failed: ${pool.error.message}`)

    const pick = chooseCandidate((pool.data || []) as Row[], now)

    if (!pick) {
      // Nothing to write is a real answer some weeks. A run of them is not.
      const empties = await supabase.from('content_engine_runs')
        .select('status, reason, finished_at')
        .eq('job', 'geo_weekly')
        .order('finished_at', { ascending: false })
        .limit(CONSECUTIVE_EMPTY_ALARM)
      const priorEmpty = ((empties.data || []) as Row[]).filter(r => r.status === 'skipped' || r.status === 'failed').length
      const consecutive = priorEmpty + 1
      const reason = consecutive >= CONSECUTIVE_EMPTY_ALARM
        ? `Nothing worth writing for ${consecutive} weeks running. Either the research run has stopped producing recommendations it can argue for, or every one it produced is for a subject with no site to publish to. This is a broken pipeline, not a quiet week.`
        : 'No recommendation is both winnable and unwritten this week. The research run either found nothing it could argue for, or everything it found is already staged.'
      // The alarm: a run of empty weeks stops reporting itself as healthy.
      if (consecutive >= CONSECUTIVE_EMPTY_ALARM) {
        return res.status(500).json({ ok: false, error: 'nothing_produced', consecutive, reason, ms: Date.now() - started })
      }
      return res.status(200).json({ ok: true, skipped: 'no_candidate', consecutive, reason, ms: Date.now() - started })
    }

    if (dry) {
      return res.status(200).json({ ok: true, dry: true, pick, ms: Date.now() - started })
    }

    const drafted = await draftIdea(pick.id, {})
    if (drafted.status !== 200) {
      // A refusal is information, not an error: the commonest one is that the
      // page had nothing to argue. Reported and left for a human to read.
      return res.status(200).json({
        ok: true, skipped: 'draft_refused', pick,
        draft_status: drafted.status, draft: drafted.body,
        reason: 'The page was refused by the checks and nothing was published. A refused page is worth more than a weak one.',
        ms: Date.now() - started,
      })
    }

    const published = await publishIdea(pick.id, {})
    if (published.status !== 200 || published.body.ok !== true) {
      return res.status(200).json({
        ok: true, skipped: 'publish_failed', pick,
        draft: drafted.body, publish: published.body,
        reason: 'The page was written and passed its checks but could not be staged. The draft is on the idea and can be staged again once the cause is fixed.',
        ms: Date.now() - started,
      })
    }

    await supabase.from('audit_log').insert({
      event_type: 'geo_weekly',
      actor: 'geo-weekly',
      target: 'geo_predictions',
      display_message: `Wrote and staged this week's page, answering "${pick.target_query}".`,
      details: JSON.stringify({ pick, publish: published.body }),
    }).then(r => { if (r.error) console.error('geo weekly audit write failed', r.error.message) })

    return res.status(200).json({
      ok: true,
      pick,
      draft: drafted.body,
      publish: published.body,
      ms: Date.now() - started,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    console.error('geo weekly failed', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }
}

export default withContentRun('geo_weekly', handler)
