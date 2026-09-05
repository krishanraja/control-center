import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { getOperatorTz, ymdIn, shiftYmd } from '../_timezone.js'
import { weekEndingFor, weekRangeUtc } from '../_scorecard.js'

// The Rule 6 tripwire's evidence: commits by Krish in the scorecard week.
//
// Rule 6 in the ikigai is "build nothing unasked". The one thing a build
// leaves behind whether or not anyone asked for it is a commit, so commits are
// the count and hours are an estimate from them (UNASKED_HOURS_PER_COMMIT,
// default 0.5). The estimate is labelled as one everywhere it renders; the
// commit count is the fact.
//
// Runs Saturday 04:00 UTC (vercel.json), before the Friday freeze at 04:30, so
// the freeze reads a synced row. Accepts ?week_ending=YYYY-MM-DD for backfills.
//
// Without GITHUB_TOKEN and GITHUB_REPOS it does nothing and says so: a row of
// zeros written by an unconfigured sync would read as a clean week, which is
// the one thing this route must never claim by accident.
//
//   GET (CRON_SECRET)   POST (manual, through the edge gate)

export const config = { maxDuration: 120 }

const MAX_PAGES = 10

interface Commit { sha: string }

function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

async function countCommits(repo: string, author: string, token: string, since: string, until: string): Promise<number> {
  const params = new URLSearchParams({ author, since, until, per_page: '100' })
  let url: string | null = `https://api.github.com/repos/${repo}/commits?${params.toString()}`
  let total = 0
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'control-center-scorecard',
      },
    })
    if (r.status === 409) return total // empty repository
    if (!r.ok) throw new Error(`github ${repo}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`)
    const body = (await r.json()) as Commit[]
    total += Array.isArray(body) ? body.length : 0
    url = nextLink(r.headers.get('link'))
  }
  return total
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  const token = process.env.GITHUB_TOKEN || ''
  const repos = (process.env.GITHUB_REPOS || '').split(',').map(s => s.trim()).filter(Boolean)
  const author = (process.env.GITHUB_AUTHOR || '').trim()
  if (!token || repos.length === 0) {
    return res.status(200).json({ ok: false, skipped: 'github_not_configured' })
  }
  const perCommit = Number(process.env.UNASKED_HOURS_PER_COMMIT || '0.5')
  const hoursPerCommit = Number.isFinite(perCommit) && perCommit >= 0 ? perCommit : 0.5

  try {
    const tz = await getOperatorTz()
    const q = typeof req.query?.week_ending === 'string' ? req.query.week_ending : ''
    // Cron runs early on Saturday, so yesterday in the operator's zone is the
    // Friday that just ended. Run by hand on a weekday it lands on the Friday
    // ahead, which is the open week; either way it is a Friday.
    const weekEnding = /^\d{4}-\d{2}-\d{2}$/.test(q)
      ? weekEndingFor(q)
      : weekEndingFor(shiftYmd(ymdIn(new Date(), tz), -1))
    const { start, end } = weekRangeUtc(weekEnding, tz)

    const counts: Record<string, number> = {}
    let commits = 0
    for (const repo of repos) {
      const n = await countCommits(repo, author, token, start.toISOString(), end.toISOString())
      counts[repo] = n
      commits += n
    }
    const hours = Math.round(commits * hoursPerCommit * 10) / 10
    const now = new Date().toISOString()

    const { error } = await supabase.from('build_activity_weeks').upsert({
      week_ending: weekEnding,
      commits,
      hours_estimate: hours,
      hours_per_commit: hoursPerCommit,
      repos: repos.map(r => ({ repo: r, commits: counts[r] })),
      author: author || null,
      synced_at: now,
      updated_at: now,
    }, { onConflict: 'week_ending' })
    if (error) throw new Error(`build_activity_weeks upsert failed: ${error.message}`)

    return res.status(200).json({
      ok: true, week_ending: weekEnding, commits, hours_estimate: hours, hours_per_commit: hoursPerCommit, repos: counts,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
