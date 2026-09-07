#!/usr/bin/env node
/**
 * Docs steward change digest.
 *
 * Produces the markdown the steward reads before it decides whether a repo's
 * documentation needs work. Everything in it is counted from git and the
 * working tree, never asserted. The steward reasons; this script measures.
 *
 * Why the digest starts from the last recorded head rather than "the last 24
 * hours": a night the workflow did not run must not become a day the docs
 * silently skipped. The head in NOW.md is the last commit the docs were
 * reconciled against, so "since head" is always the full gap.
 *
 * Dependency-free on purpose.
 *
 *   node scripts/steward/digest.mjs <repo-path> [--since <sha>] [--fleet <fleet.json>] [--repo <name>]
 *
 * Without --since it reads head from NOW.md, then falls back to the fleet
 * entry's bootstrap_head, then to 30 days ago.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'

const args = process.argv.slice(2)
const repo = args.find((a) => !a.startsWith('--')) || '.'
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const git = (...a) => { try { return execFileSync('git', ['-c', 'core.quotePath=false', ...a], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim() } catch { return '' } }
const read = (rel) => readFileSync(join(repo, rel), 'utf8')
const exists = (rel) => existsSync(join(repo, rel))

let entry = null
const fleetPath = flag('--fleet')
if (fleetPath) {
  const fleet = JSON.parse(readFileSync(fleetPath, 'utf8'))
  const name = flag('--repo') || basename(git('rev-parse', '--show-toplevel'))
  entry = fleet.repos.find((r) => r.name === name) || null
  if (entry) entry = { ...fleet.defaults, ...entry }
}

// ------------------------------------------------------------- since
let since = flag('--since')
let sinceSource = 'argument'
if (!since && exists('NOW.md')) {
  const m = read('NOW.md').match(/^head:\s*([0-9a-f]{7,40})\s*$/m)
  if (m) { since = m[1]; sinceSource = 'NOW.md head' }
}
if (!since && entry && entry.bootstrap_head) { since = entry.bootstrap_head; sinceSource = 'fleet bootstrap_head' }
if (since && !git('cat-file', '-t', since)) { since = null }
if (!since) {
  since = git('rev-list', '-1', '--before=30 days ago', 'HEAD') || git('rev-list', '--max-parents=0', 'HEAD').split('\n').pop()
  sinceSource = 'fallback (30 days ago or root commit)'
}

const head = git('rev-parse', '--short', 'HEAD')
const range = `${since}..HEAD`
const today = new Date().toISOString().slice(0, 10)
const out = []
const p = (s = '') => out.push(s)

p(`# Steward digest: ${entry ? entry.name : basename(git('rev-parse', '--show-toplevel'))}`)
p()
p(`- Generated: ${today}`)
p(`- HEAD: \`${head}\``)
p(`- Since: \`${git('rev-parse', '--short', since)}\` (${sinceSource}, ${git('log', '-1', '--format=%cs', since)})`)

// ------------------------------------------------------------ commits
const commits = git('log', '--format=%h\t%cs\t%an\t%s', range).split('\n').filter(Boolean).map((l) => {
  const [sha, date, author, ...rest] = l.split('\t'); return { sha, date, author, subject: rest.join('\t') }
})
const steward = commits.filter((c) => c.subject.startsWith('docs(steward):'))
const real = commits.filter((c) => !c.subject.startsWith('docs(steward):'))
p(`- Commits since: ${commits.length} (${real.length} non-steward, ${steward.length} steward)`)
const authors = [...new Set(real.map((c) => c.author))]
if (authors.length) p(`- Authors: ${authors.join(', ')}`)
p()
p('## Commits (newest first, non-steward)')
p()
if (!real.length) p('None. If NOW.md validates, there is nothing to do.')
for (const c of real.slice(0, 120)) p(`- ${c.date} \`${c.sha}\` ${c.subject}`)
if (real.length > 120) p(`- ... ${real.length - 120} more`)
p()

// ------------------------------------------------------- files changed
const changed = git('diff', '--name-status', '-M', since, 'HEAD').split('\n').filter(Boolean).map((l) => {
  const [code, a, b] = l.split('\t'); return { code: code[0], path: b || a, from: b ? a : null }
})
const isDoc = (f) => /\.md$/i.test(f) || (entry && entry.truth_files && entry.truth_files.includes(f))
const docsChanged = changed.filter((c) => isDoc(c.path))
const codeChanged = changed.filter((c) => !isDoc(c.path))
const byArea = {}
for (const c of codeChanged) { const area = c.path.includes('/') ? c.path.split('/')[0] : '(root)'; byArea[area] = (byArea[area] || 0) + 1 }
p('## Non-documentation files changed, by area')
p()
if (!codeChanged.length) p('None.')
for (const [area, n] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) p(`- ${area}: ${n}`)
p()
if (codeChanged.length) {
  p('<details><summary>All non-documentation paths</summary>')
  p()
  for (const c of codeChanged.slice(0, 200)) p(`- ${c.code} ${c.path}`)
  if (codeChanged.length > 200) p(`- ... ${codeChanged.length - 200} more`)
  p()
  p('</details>')
  p()
}
p('## Documentation files changed')
p()
if (!docsChanged.length) p('None. Every doc is as it was at the last reconciliation.')
for (const c of docsChanged) p(`- ${c.code} ${c.path}${c.from ? ` (from ${c.from})` : ''}`)
p()

// ---------------------------------------------------------- inventory
const historyDir = entry ? dirname(entry.history_log) : 'docs/history'
const tracked = git('ls-files', '*.md', '**/*.md').split('\n').filter(Boolean)
  .filter((f) => !f.includes('node_modules/') && !f.startsWith(historyDir + '/') && !/\/_archive\//.test(f) && f !== 'NOW.md')
const STAMP = /(?:last (?:updated|verified|reviewed|reconciled|touched)|current as of|as of|generated|reviewed)\s*:?\s*\**\s*(\d{4}-\d{2}-\d{2}|\d{1,2} \w+ \d{4})/i
const CLAIMS_CURRENT = /(?:^|\n)\s*(?:-\s*)?\**status\**\s*:\**\s*(current|active|live)\b/i
const monthNum = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' }
const isoDate = (s) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2}) (\w+) (\d{4})$/)
  if (!m) return null
  const mo = monthNum[m[2].toLowerCase()]
  return mo ? `${m[3]}-${mo}-${String(m[1]).padStart(2, '0')}` : null
}
const lastCodeDate = real.length ? real[0].date : null
const rows = []
for (const f of tracked) {
  let text = ''
  try { text = read(f) } catch { continue }
  const headText = text.slice(0, 1500)
  const stamp = headText.match(STAMP)
  const stampDate = stamp ? isoDate(stamp[1]) : null
  const lastCommit = git('log', '-1', '--format=%cs', '--', f)
  const claimsCurrent = CLAIMS_CURRENT.test(headText)
  const lines = text.split('\n').length
  rows.push({ f, lines, lastCommit, stampDate, claimsCurrent })
}
const stale = rows.filter((r) => r.stampDate && lastCodeDate && r.stampDate < lastCodeDate)
const untouched = rows.filter((r) => r.lastCommit && r.lastCommit < git('log', '-1', '--format=%cs', since))
p(`## Documentation inventory (${rows.length} tracked markdown files outside ${historyDir})`)
p()
p('| File | Lines | Last commit | Stamp | Claims current |')
p('|---|---:|---|---|---|')
for (const r of rows.sort((a, b) => a.f.localeCompare(b.f))) p(`| ${r.f} | ${r.lines} | ${r.lastCommit} | ${r.stampDate || ''} | ${r.claimsCurrent ? 'yes' : ''} |`)
p()
p('## Stamps older than the newest code change')
p()
if (!lastCodeDate) p('No non-steward commits in range, so no stamp can be stale relative to them.')
else if (!stale.length) p(`None. Newest code change is ${lastCodeDate}.`)
else for (const r of stale) p(`- ${r.f}: stamped ${r.stampDate}, code moved ${lastCodeDate}`)
p()
p('## Files claiming to be current that were not touched in this range')
p()
const claimsUntouched = rows.filter((r) => r.claimsCurrent && !docsChanged.some((c) => c.path === r.f))
if (!claimsUntouched.length) p('None.')
else for (const r of claimsUntouched) p(`- ${r.f} (last commit ${r.lastCommit})`)
p()

// ------------------------------------------------------- duplicates
p('## Duplicate and unlabelled candidates')
p()
const byBase = {}
for (const r of rows) { const b = basename(r.f).toLowerCase().replace(/\s*\(\d+\)/, ''); (byBase[b] = byBase[b] || []).push(r.f) }
const dups = Object.entries(byBase).filter(([b, fs]) => fs.length > 1 && b !== 'readme.md')
const suspicious = rows.filter((r) => /\(\d+\)\.md$|-v\d+\.md$|-old\.md$|-copy\.md$|^docs\/md\b|untitled/i.test(r.f))
const noHeader = rows.filter((r) => { const t = read(r.f).slice(0, 400); return !/^#\s/m.test(t) })
if (!dups.length && !suspicious.length && !noHeader.length) p('None.')
for (const [b, fs] of dups) p(`- same basename \`${b}\`: ${fs.join(', ')}`)
for (const r of suspicious) p(`- suspicious name: ${r.f}`)
for (const r of noHeader) p(`- no H1 in the first 400 characters: ${r.f}`)
p()

// ------------------------------------------------------- NOW.md age
if (exists('NOW.md')) {
  const now = read('NOW.md')
  const asOf = (now.match(/^as_of:\s*(\S+)/m) || [])[1]
  const old = [...now.matchAll(/^- \*?\*?(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]).filter((d) => asOf && (new Date(asOf) - new Date(d)) / 86400000 > 30)
  p('## NOW.md')
  p()
  p(`- as_of: ${asOf || 'missing'}`)
  p(`- "What changed recently" bullets older than 30 days: ${old.length ? old.join(', ') : 'none'}`)
} else {
  p('## NOW.md')
  p()
  p('- Missing. This is a first reconciliation; write it per docs/steward/SCHEMA.md.')
}
p()

process.stdout.write(out.join('\n') + '\n')
