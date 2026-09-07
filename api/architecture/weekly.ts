import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { getOperatorTz, ymdIn, shiftYmd } from '../_timezone.js'
import { weekEndingFor } from '../_scorecard.js'
import { sanitizeVoice } from '../_content.js'
import { buildProductFor, ANONYMOUS_PUBLIC_NAME, type BuildMeta } from '../_buildSignals.js'

// The architecture doc, kept current by the engine.
//
// Krish, 2026-09-07: the VPS and Google Drive copies of the OS architecture
// doc are deleted for good ("too fragile to keep up to date and nothing reads
// them"), GitHub `docs/MINDMAKE_OS_ARCHITECTURE.md` on main is the ONE
// surface, and the engine keeps it up to date regularly.
//
// Every Sunday 13:00 UTC, after Saturday's build-signal ingest and Sunday's
// radar pass, this route writes one dated entry at the top of section 20
// (the rolling changelog) from the week's build signals: what was merged in
// each named product, how much moved, and which of it the editorial radar
// found an angle in. It also stamps the header's "Last engine refresh" line,
// which the Monday note reads back so a dark cron shows as stale rather than
// as silence.
//
// The doc lives in a PUBLIC repo, so the entry follows the same registry as
// content: named products are named, everything else folds into one
// "side builds" line. Nothing here writes a secret, a lead or a figure.
//
// Writes go through the GitHub contents API with the same GITHUB_TOKEN the
// scorecard reads with. If that token cannot write, the route says
// github_write_forbidden and the Monday note carries the stale stamp; it
// never fakes a refresh.
//
//   GET  (CRON_SECRET)       scheduled run
//   POST (secret or app)     manual run
//   ?dry=1                   compose the entry, write nothing
//   ?week_ending=YYYY-MM-DD  backfill a week

export const config = { maxDuration: 60 }

export const ARCHITECTURE_DOC_PATH = 'docs/MINDMAKE_OS_ARCHITECTURE.md'
export const ARCHITECTURE_REPO = 'krishanraja/control-center'
export const CHANGELOG_HEADING = '## 20. Recent architectural changes - rolling changelog'
export const REFRESH_MARK = /\*\*Last engine refresh:\*\* (\d{4}-\d{2}-\d{2}|never)/
const ENTRY_MARK = (week: string) => `<!-- engine-week:${week} -->`

type JsonRecord = Record<string, unknown>
interface SignalRow { idea: string; meta: JsonRecord | null; source_captured_at: string | null }

function asRecord(v: unknown): JsonRecord {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as JsonRecord : {}
}

function lensStatus(meta: JsonRecord, series: 'money_of_ai' | 'built_with_ai'): string | null {
  const lenses = asRecord(asRecord(meta.editorial_radar).lenses)
  const s = asRecord(lenses[series]).status
  return typeof s === 'string' ? s : null
}

function verdictWord(status: string | null): string {
  if (status === 'eligible') return 'an angle ready'
  if (status === 'near_miss') return 'a near miss'
  if (status === 'rejected' || status === 'no_angle') return 'no angle'
  return 'not judged yet'
}

/** The section 20 entry for one week. Pure, so the guard can test it. */
export function composeWeekEntry(weekEnding: string, writtenOn: string, rows: SignalRow[]): string {
  const named: string[] = []
  let sideCommits = 0
  let sideRepos = 0
  for (const row of rows) {
    const meta = asRecord(row.meta)
    const build = asRecord(meta.build) as unknown as Partial<BuildMeta>
    if (!build.repo) continue
    const product = buildProductFor(build.repo)
    if (product.mode !== 'named') {
      sideRepos += 1
      sideCommits += Number(build.commit_count || 0)
      continue
    }
    const prs = (build.prs || []).map(p => sanitizeVoice(p.title)).filter(Boolean)
    const merged = prs.length ? ` Merged: ${prs.slice(0, 12).join(' | ')}${prs.length > 12 ? ` and ${prs.length - 12} more` : ''}.` : ''
    const stat = build.files_changed != null ? `, ${build.files_changed} files, +${build.additions ?? 0} -${build.deletions ?? 0}` : ''
    const money = verdictWord(lensStatus(meta, 'money_of_ai'))
    const built = verdictWord(lensStatus(meta, 'built_with_ai'))
    named.push(`- **${product.public_name}**: ${build.commit_count ?? 0} commits, ${build.pr_count ?? 0} merged PRs${stat}.${merged} Content radar: Built with AI ${built}, The Money of AI ${money}.`)
  }
  if (sideRepos) named.push(`- **${ANONYMOUS_PUBLIC_NAME}s**: ${sideCommits} commits across ${sideRepos} ${sideRepos === 1 ? 'repo' : 'repos'}.`)
  const body = named.length ? named.join('\n') : '- No build signals were recorded for this week. Either nothing was built, or the Saturday ingest did not run; the Monday note says which.'
  return [
    `### ${writtenOn}: the week's builds, written by the engine ${ENTRY_MARK(weekEnding)}`,
    '',
    `Week ending Friday ${weekEnding}. Written by \`api/architecture/weekly.ts\` from the \`build_signal\` rows the Saturday ingest wrote (\`docs/CONTENT-ENGINE-BUILD-SIGNALS.md\`). Named products are named; every other repo folds into one line because this document is public. This entry is the engine's record, not a ruling: a ruling goes in section 0a, by a person.`,
    '',
    body,
    '',
  ].join('\n')
}

/** Insert or replace the week's entry directly under the section 20 heading,
 *  and stamp the header. Pure, so the guard can test it. */
export function applyWeekEntry(doc: string, weekEnding: string, entry: string, writtenOn: string): { next: string; replaced: boolean } {
  const mark = ENTRY_MARK(weekEnding)
  let next = doc
  let replaced = false
  const existing = next.indexOf(mark)
  if (existing >= 0) {
    const start = next.lastIndexOf('\n### ', existing) + 1
    const after = next.indexOf('\n### ', existing)
    const end = after >= 0 ? after + 1 : next.length
    next = next.slice(0, start) + entry + next.slice(end)
    replaced = true
  } else {
    const h = next.indexOf(CHANGELOG_HEADING)
    if (h < 0) throw new Error('changelog heading not found')
    const lineEnd = next.indexOf('\n', h)
    const insertAt = lineEnd + 1
    next = `${next.slice(0, insertAt)}\n${entry}${next.slice(insertAt)}`
  }
  next = REFRESH_MARK.test(next)
    ? next.replace(REFRESH_MARK, `**Last engine refresh:** ${writtenOn}`)
    : next
  return { next, replaced }
}

async function gh(url: string, token: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'control-center-architecture-weekly',
      ...(init.headers || {}),
    },
  })
  return r
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const dry = req.query.dry === '1'
  const token = process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(200).json({ ok: false, skipped: 'github_not_configured' })

  try {
    const tz = await getOperatorTz()
    const today = ymdIn(new Date(), tz)
    const q = typeof req.query.week_ending === 'string' ? req.query.week_ending : ''
    // The Friday just gone (same rule as the Monday note): the Friday on or
    // after today, less a week. On a Friday itself that is the previous one.
    const weekEnding = /^\d{4}-\d{2}-\d{2}$/.test(q) ? weekEndingFor(q) : shiftYmd(weekEndingFor(today), -7)

    const rows = await supabase.from('content_ideas')
      .select('idea, meta, source_captured_at')
      .eq('source_type', 'build_signal')
      .is('parent_idea_id', null)
      .like('source_ref', `build:%:${weekEnding}`)
      .limit(40)
    if (rows.error) throw new Error(`build_signal read failed: ${rows.error.message}`)
    const entry = composeWeekEntry(weekEnding, today, (rows.data || []) as SignalRow[])

    const read = await gh(`https://api.github.com/repos/${ARCHITECTURE_REPO}/contents/${ARCHITECTURE_DOC_PATH}?ref=main`, token)
    if (!read.ok) return res.status(200).json({ ok: false, skipped: `github_read_${read.status}`, week_ending: weekEnding })
    const file = (await read.json()) as { sha: string; content: string; encoding: string }
    const doc = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
    const { next, replaced } = applyWeekEntry(doc, weekEnding, entry, today)
    const changed = next !== doc

    if (dry) return res.status(200).json({ ok: true, dry: true, week_ending: weekEnding, signals: (rows.data || []).length, replaced, changed, entry })
    if (!changed) return res.status(200).json({ ok: true, week_ending: weekEnding, signals: (rows.data || []).length, skipped: 'already_current' })

    const write = await gh(`https://api.github.com/repos/${ARCHITECTURE_REPO}/contents/${ARCHITECTURE_DOC_PATH}`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Architecture doc: the week ending ${weekEnding}, written by the engine [skip ci]\n\nOne dated entry at the top of section 20 from the week's build signals, and the header's refresh stamp. api/architecture/weekly.ts, Sunday 13:00 UTC.`,
        content: Buffer.from(next, 'utf8').toString('base64'),
        sha: file.sha,
        branch: 'main',
        committer: { name: 'Krish Raja', email: 'hello@krishraja.com' },
      }),
    })
    if (write.status === 403 || write.status === 404) {
      await supabase.from('audit_log').insert({ event_type: 'architecture_weekly_blocked', actor: 'architecture-weekly', details: JSON.stringify({ week_ending: weekEnding, status: write.status }) })
      return res.status(200).json({ ok: false, skipped: 'github_write_forbidden', status: write.status, week_ending: weekEnding })
    }
    if (!write.ok) throw new Error(`github write failed: HTTP ${write.status} ${(await write.text().catch(() => '')).slice(0, 200)}`)
    const result = (await write.json()) as { commit?: { sha?: string; html_url?: string } }

    await supabase.from('audit_log').insert({
      event_type: 'architecture_weekly_refresh',
      actor: 'architecture-weekly',
      details: JSON.stringify({ week_ending: weekEnding, signals: (rows.data || []).length, replaced, commit: result.commit?.sha || null }),
    }).then(r => { if (r.error) console.error('architecture weekly audit write failed', r.error.message) })

    return res.status(200).json({ ok: true, week_ending: weekEnding, signals: (rows.data || []).length, replaced, commit: result.commit?.sha || null, url: result.commit?.html_url || null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('architecture weekly failed', msg)
    return res.status(500).json({ ok: false, error: msg })
  }
}
