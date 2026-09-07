import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from './_auth.js'
import { supabase } from './_supabase.js'
import { checkDuplicate } from './_dedup.js'
import { getOperatorTz, ymdIn, shiftYmd } from './_timezone.js'
import { weekEndingFor, weekRangeUtc } from './_scorecard.js'
import { buildSignalRow, buildSourceRef, fetchRepoWeek, normalizeRepo, type BuildSignalRow } from './_buildSignals.js'
import { withContentRun } from './_runs.js'

// discover-build-signals: the week's builds, offered as content.
//
// Saturday 05:00 UTC (vercel.json), one hour after api/scorecard/github-sync.ts
// has counted the same commits against the Rule 6 tripwire. It reads every
// repo in GITHUB_REPOS for the scorecard week (Saturday to Friday in the
// operator's zone), and writes ONE content_ideas source row per repo that had
// commits: source_type 'build_signal', flagged meta.mindmake_build, expiring
// after SIGNAL_TTL_DAYS if undecided. The editorial radar (api/content-opportunities/refresh,
// daily 12:00 UTC) then judges each row through the Money of AI and Built with
// AI lenses, and Krish approves or passes in the Content tab as he does for any
// other source. Nothing here writes a piece.
//
// Anti-flood, in order: the open-card governor (skip the run while >=
// OPEN_GOVERNOR build rows are still undecided), the per-run cap, the
// source_ref upsert (a re-run refreshes the week's row, never duplicates it),
// the tiered checkDuplicate, and the partial unique index on live source_ref.
//
// Honest-by-construction: without GITHUB_TOKEN and GITHUB_REPOS it does
// nothing and says so, because an empty run written as "no builds" would read
// as a quiet week. Every gate is counted in the response and one audit_log
// row records the run.
//
//   GET  (CRON_SECRET)        scheduled run
//   POST (secret or app)      manual run
//   ?dry=1                    full read, no writes
//   ?week_ending=YYYY-MM-DD   backfill a week (a Friday, or the Friday after)
//   ?repos=a/b,c/d            clamp to a subset of GITHUB_REPOS

export const config = { maxDuration: 120 }

const MAX_SIGNALS = 8
const OPEN_GOVERNOR = 12

type Row = { id: string; state: string | null; meta: Record<string, unknown> | null }

function decided(row: Row): boolean {
  const radar = row.meta && typeof row.meta.editorial_radar === 'object' && row.meta.editorial_radar
    ? row.meta.editorial_radar as Record<string, unknown>
    : null
  const decisions = radar && typeof radar.decisions === 'object' && radar.decisions ? radar.decisions as Record<string, unknown> : null
  return Boolean(decisions && Object.keys(decisions).length)
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const started = Date.now()
  const dry = req.query.dry === '1'

  const token = process.env.GITHUB_TOKEN || ''
  const configured = (process.env.GITHUB_REPOS || '').split(',').map(normalizeRepo).filter(Boolean)
  // No author filter, on purpose, and the scorecard's github-sync has none
  // either since 2026-09-07: a dry run showed most session commits carry the
  // coding agent's noreply address (36 of 38 in one repo, 18 of 34 here),
  // which a login filter drops. Every repo in GITHUB_REPOS is Krish's, so
  // every commit in it is his build.
  const author = ''
  if (!token || configured.length === 0) {
    return res.status(200).json({ ok: false, skipped: 'github_not_configured' })
  }
  const subset = typeof req.query.repos === 'string'
    ? new Set(req.query.repos.split(',').map(normalizeRepo).filter(Boolean))
    : null
  const repos = subset ? configured.filter(r => subset.has(r)) : configured

  try {
    const tz = await getOperatorTz()
    const q = typeof req.query.week_ending === 'string' ? req.query.week_ending : ''
    const weekEnding = /^\d{4}-\d{2}-\d{2}$/.test(q)
      ? weekEndingFor(q)
      : weekEndingFor(shiftYmd(ymdIn(new Date(), tz), -1))
    const { start, end } = weekRangeUtc(weekEnding, tz)
    const since = start.toISOString()
    const until = end.toISOString()

    // Governor: while Krish has not looked at the last rows, do not add more.
    const openRead = await supabase
      .from('content_ideas')
      .select('id,state,meta')
      .eq('source_type', 'build_signal')
      .is('parent_idea_id', null)
      .is('buried_at', null)
      .in('state', ['seeded', 'researching'])
      .limit(100)
    if (openRead.error) throw new Error(`build_signal open read failed: ${openRead.error.message}`)
    const open = ((openRead.data || []) as Row[]).filter(r => !decided(r)).length
    if (open >= OPEN_GOVERNOR && !dry) {
      return res.status(200).json({ ok: true, skipped: 'backlog_governor', open, week_ending: weekEnding })
    }

    const counts: Record<string, number> = { repos: repos.length, quiet: 0, read: 0, inserted: 0, refreshed: 0, duplicate: 0, capped: 0, failed: 0 }
    const errors: Record<string, string> = {}
    const written: { repo: string; id: string | null; action: 'insert' | 'refresh' | 'duplicate' | 'dry' | 'capped' }[] = []
    const rows: BuildSignalRow[] = []

    for (const repo of repos) {
      try {
        const week = await fetchRepoWeek(repo, author, token, weekEnding, since, until)
        if (!week) { counts.quiet += 1; continue }
        counts.read += 1
        rows.push(buildSignalRow(week))
      } catch (e) {
        counts.failed += 1
        errors[repo] = e instanceof Error ? e.message : String(e)
      }
    }

    // The busiest weeks first, so a cap drops the quietest repo, not the story.
    rows.sort((a, b) => b.meta.build.commit_count - a.meta.build.commit_count)

    for (const row of rows) {
      if (written.filter(w => w.action === 'insert' || w.action === 'refresh' || w.action === 'dry').length >= MAX_SIGNALS) {
        counts.capped += 1
        written.push({ repo: row.meta.build.repo, id: null, action: 'capped' })
        continue
      }
      if (dry) { written.push({ repo: row.meta.build.repo, id: null, action: 'dry' }); continue }

      // Same repo, same week: refresh the row in place. The radar re-runs when
      // its source hash changes, so a refreshed digest gets re-judged.
      const ref = buildSourceRef(row.meta.build.repo, weekEnding)
      const existing = await supabase.from('content_ideas')
        .select('id,meta')
        .eq('source_type', 'build_signal')
        .eq('source_ref', ref)
        .is('parent_idea_id', null)
        .limit(1)
        .maybeSingle()
      if (existing.error) throw new Error(`build_signal lookup failed: ${existing.error.message}`)
      if (existing.data) {
        const prior = (existing.data as { id: string; meta: Record<string, unknown> | null })
        const update = await supabase.from('content_ideas').update({
          thesis: row.thesis,
          source_url: row.source_url,
          source_snippet: row.source_snippet,
          meta: { ...(prior.meta || {}), ...row.meta },
          updated_at: new Date().toISOString(),
        }).eq('id', prior.id).select('id')
        if (update.error) throw new Error(`build_signal refresh failed: ${update.error.message}`)
        counts.refreshed += 1
        written.push({ repo: row.meta.build.repo, id: prior.id, action: 'refresh' })
        continue
      }

      const dup = await checkDuplicate('content_ideas', { url: row.source_url, title: row.idea, text: row.thesis })
      if (dup.is_duplicate && dup.match_id) {
        counts.duplicate += 1
        written.push({ repo: row.meta.build.repo, id: dup.match_id, action: 'duplicate' })
        continue
      }
      const inserted = await supabase.from('content_ideas').insert({
        ...row,
        canonical_url: dup.keys.canonical_url,
        title_norm: dup.keys.title_norm,
        content_hash: dup.keys.content_hash,
      }).select('id').single()
      if (inserted.error) {
        // 23505 is the live source_ref index: a concurrent run won the race.
        if (inserted.error.code === '23505') { counts.duplicate += 1; written.push({ repo: row.meta.build.repo, id: null, action: 'duplicate' }); continue }
        throw new Error(`build_signal insert failed: ${inserted.error.message}`)
      }
      counts.inserted += 1
      written.push({ repo: row.meta.build.repo, id: (inserted.data as { id: string }).id, action: 'insert' })
    }

    if (!dry) {
      await supabase.from('audit_log').insert({
        event_type: 'build_signals_run',
        actor: 'discover-build-signals',
        details: JSON.stringify({ week_ending: weekEnding, counts, errors, ms: Date.now() - started }),
      }).then(r => { if (r.error) console.error('build_signals audit write failed', r.error.message) })
    }

    return res.status(200).json({
      ok: counts.failed < repos.length,
      dry,
      week_ending: weekEnding,
      since,
      until,
      counts,
      errors,
      written,
      ms: Date.now() - started,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('discover-build-signals failed', msg)
    return res.status(500).json({ ok: false, error: msg })
  }
}

// Every run lands in content_engine_runs so the Content tab can say when this
// job last succeeded. See api/_runs.ts.
export default withContentRun('build_signals', handler)
