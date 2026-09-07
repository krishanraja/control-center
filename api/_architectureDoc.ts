import { sanitizeVoice } from './_content.js'
import { buildProductFor, ANONYMOUS_PUBLIC_NAME, type BuildMeta } from './_buildSignals.js'

// The pure half of api/architecture/weekly.ts: composing the week's section 20
// entry and applying it to the document text. Kept apart from the route so
// the CI guard can exercise it without a Supabase client (api/_supabase.ts
// throws at import when SUPABASE_URL is unset, which is correct for a route
// and fatal for a guard).

export const ARCHITECTURE_DOC_PATH = 'docs/MINDMAKE_OS_ARCHITECTURE.md'
export const ARCHITECTURE_REPO = 'krishanraja/control-center'
export const CHANGELOG_HEADING = '## 20. Recent architectural changes - rolling changelog'
export const REFRESH_MARK = /\*\*Last engine refresh:\*\* (\d{4}-\d{2}-\d{2}|never)/
export const entryMark = (week: string): string => `<!-- engine-week:${week} -->`

type JsonRecord = Record<string, unknown>
export interface SignalRow { idea: string; meta: JsonRecord | null; source_captured_at: string | null }

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

/** The section 20 entry for one week. Named products are named; every other
 *  repo folds into one line, because the document is public. */
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
    `### ${writtenOn}: the week's builds, written by the engine ${entryMark(weekEnding)}`,
    '',
    `Week ending Friday ${weekEnding}. Written by \`api/architecture/weekly.ts\` from the \`build_signal\` rows the Saturday ingest wrote (\`docs/CONTENT-ENGINE-BUILD-SIGNALS.md\`). Named products are named; every other repo folds into one line because this document is public. This entry is the engine's record, not a ruling: a ruling goes in section 0a, by a person.`,
    '',
    body,
    '',
  ].join('\n')
}

/** Insert or replace the week's entry directly under the section 20 heading,
 *  and stamp the header. A re-run replaces the week, never duplicates it. */
export function applyWeekEntry(doc: string, weekEnding: string, entry: string, writtenOn: string): { next: string; replaced: boolean } {
  const mark = entryMark(weekEnding)
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
