#!/usr/bin/env node
/**
 * Docs steward validator.
 *
 * Why this exists: every repo in the fleet had, at the moment the steward was
 * built, at least one document that claimed to be current and was not. Three
 * "Current" docs in full-time disagreed on whether the product was launched.
 * mm-ctrl carried sixty unlabelled files uploaded in one commit. Pulse's docs
 * were frozen four weeks behind its pipeline. None of it errored, because
 * nothing read the docs against the repo. This script is that reader.
 *
 * It checks the two files the steward owns (NOW.md and the history LOG) and,
 * when given --since, the shape of the change the steward is about to push:
 * nothing deleted, nothing outside the allowlist, nothing shrunk by more than
 * a fifth without a LOG line, no secret pasted in.
 *
 * Dependency-free on purpose: a broken lockfile must never be the reason the
 * docs go unwatched.
 *
 *   node scripts/steward/validate.mjs <repo-path> [--strict] [--since <sha>]
 *        [--fleet <fleet.json>] [--repo <name>]
 *
 * --strict adds the head/as_of checks that only hold on main (the head in
 * NOW.md must be an ancestor of HEAD with only steward commits after it). CI
 * on a feature branch runs without --strict; the Action's final gate runs
 * with it.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

const args = process.argv.slice(2)
const repo = args.find((a) => !a.startsWith('--')) || '.'
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const strict = args.includes('--strict')
const since = flag('--since')
const fleetPath = flag('--fleet')
const repoName = flag('--repo')

const failures = []
const fail = (m) => failures.push(m)
// core.quotePath=false: git otherwise octal-escapes and quotes any path with a
// non-ASCII byte, and a quoted "docs/history/x.md" fails the *.md glob. Found
// on mm-ctrl's first run with an en dash in a filename.
const git = (...a) => execFileSync('git', ['-c', 'core.quotePath=false', ...a], { cwd: repo, encoding: 'utf8' }).trim()
const read = (rel) => readFileSync(join(repo, rel), 'utf8')
const exists = (rel) => existsSync(join(repo, rel))

const REQUIRED_KEYS = [
  'repo', 'product', 'as_of', 'head', 'lifecycle', 'production_url',
  'state_doc', 'history_log', 'truth_files', 'authority_order', 'steward',
]
const LIFECYCLES = new Set(['live', 'beta', 'building', 'dormant', 'archived'])
const SECTIONS = [
  'What it is',
  'Who it is for and why it matters for Mindmake',
  'Where it is right now',
  'What changed recently',
  'What is next and what is waiting on Krish',
  'Read next',
  'Do not trust',
]
const EM_DASH = /\u2014/
const SECRET_RULES = [
  { name: 'jwt', re: /eyJhbGciOi[A-Za-z0-9_.-]{20,}/ },
  { name: 'openai-or-anthropic-key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'supabase-access-token', re: /\bsbp_[a-f0-9]{30,}/ },
  { name: 'vercel-token', re: /\bvcp_[A-Za-z0-9]{30,}/ },
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]

/** Minimal YAML subset: `key: scalar` and `key: [a, b, c]`. */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return null
  const out = {}
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx === -1) { fail(`NOW.md frontmatter: unparseable line "${line}"`); continue }
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (value.startsWith('[')) {
      if (!value.endsWith(']')) { fail(`NOW.md frontmatter: unterminated list for ${key}`); continue }
      const inner = value.slice(1, -1).trim()
      out[key] = inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')) : []
    } else {
      out[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  return { data: out, bodyStart: m[0].length }
}

function looksLikePath(s) {
  return !/\s/.test(s) && (s.includes('/') || /\.(md|json|txt|ts|mjs|py|yml|yaml)$/.test(s))
}

/** Tiny glob: `**` any depth, `*` within a segment. */
function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else re += '[^/]*'
    } else if ('.+?^${}()|[]\\'.includes(c)) re += '\\' + c
    else re += c
  }
  return new RegExp('^' + re + '$')
}

// ---------------------------------------------------------------- fleet entry
let entry = null
if (fleetPath) {
  const fleet = JSON.parse(readFileSync(fleetPath, 'utf8'))
  const name = repoName || basename(git('rev-parse', '--show-toplevel'))
  entry = fleet.repos.find((r) => r.name === name)
  if (!entry) fail(`fleet: no entry named "${name}" in ${fleetPath}`)
  else entry = { ...fleet.defaults, ...entry }
}

// -------------------------------------------------------------------- NOW.md
let fm = null
if (!exists('NOW.md')) {
  fail('NOW.md: missing at repo root')
} else {
  const text = read('NOW.md')
  const lines = text.split(/\r?\n/)
  if (lines.length > 200) fail(`NOW.md: ${lines.length} lines, limit is 200. Link to the state doc instead of restating it.`)
  if (EM_DASH.test(text)) {
    const at = lines.findIndex((l) => EM_DASH.test(l)) + 1
    fail(`NOW.md: em dash at line ${at}`)
  }
  const parsed = parseFrontmatter(text)
  if (!parsed) fail('NOW.md: no YAML frontmatter block')
  else {
    fm = parsed.data
    for (const k of REQUIRED_KEYS) if (!(k in fm)) fail(`NOW.md frontmatter: missing key "${k}"`)
    if (fm.lifecycle && !LIFECYCLES.has(fm.lifecycle)) fail(`NOW.md frontmatter: lifecycle "${fm.lifecycle}" is not one of ${[...LIFECYCLES].join(' | ')}`)
    if (fm.as_of && !/^\d{4}-\d{2}-\d{2}$/.test(fm.as_of)) fail(`NOW.md frontmatter: as_of "${fm.as_of}" is not YYYY-MM-DD`)
    if (fm.head && !/^[0-9a-f]{7,40}$/.test(fm.head)) fail(`NOW.md frontmatter: head "${fm.head}" is not a sha`)
    if (fm.repo && !/^krishanraja\/[A-Za-z0-9._-]+$/.test(fm.repo)) fail(`NOW.md frontmatter: repo "${fm.repo}" should be krishanraja/<name>`)
    if (fm.production_url && fm.production_url !== 'none' && !/^https?:\/\//.test(fm.production_url)) fail('NOW.md frontmatter: production_url must be an https url or the word none')
    for (const key of ['state_doc', 'history_log']) if (fm[key] && !exists(fm[key])) fail(`NOW.md frontmatter: ${key} "${fm[key]}" does not exist`)
    if (Array.isArray(fm.truth_files)) {
      for (const p of fm.truth_files) if (!exists(p)) fail(`NOW.md frontmatter: truth file "${p}" does not exist`)
    } else if (fm.truth_files !== undefined) {
      fail('NOW.md frontmatter: truth_files must be a list, use [] when there are none')
    }
    if (fm.never_publish !== undefined && !Array.isArray(fm.never_publish)) fail('NOW.md frontmatter: never_publish must be a list')
    if (Array.isArray(fm.authority_order)) {
      if (fm.authority_order.length === 0) fail('NOW.md frontmatter: authority_order is empty; copy the repo\'s own precedence list')
      for (const p of fm.authority_order) if (looksLikePath(p) && !exists(p)) fail(`NOW.md frontmatter: authority_order entry "${p}" does not exist`)
    } else if (fm.authority_order !== undefined) fail('NOW.md frontmatter: authority_order must be a list')
    if (entry && fm.history_log && fm.history_log !== entry.history_log) fail(`NOW.md frontmatter: history_log "${fm.history_log}" disagrees with fleet.json "${entry.history_log}"`)
    if (entry && fm.state_doc && fm.state_doc !== entry.state_doc) fail(`NOW.md frontmatter: state_doc "${fm.state_doc}" disagrees with fleet.json "${entry.state_doc}"`)

    // Sections, in order, exact headings (the third carries a date suffix).
    const body = text.slice(parsed.bodyStart)
    const h2s = body.split(/\r?\n/).filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())
    const expectedIdx = SECTIONS.map((s) => h2s.findIndex((h) => h === s || (s === 'Where it is right now' && h.startsWith('Where it is right now (as of '))))
    SECTIONS.forEach((s, i) => { if (expectedIdx[i] === -1) fail(`NOW.md: missing section "## ${s}"`) })
    const present = expectedIdx.filter((i) => i !== -1)
    if (present.some((v, i) => i > 0 && v < present[i - 1])) fail('NOW.md: sections are out of order (see docs/steward/SCHEMA.md)')
    const whereIdx = h2s.find((h) => h.startsWith('Where it is right now (as of '))
    if (whereIdx && fm.as_of && !whereIdx.includes(fm.as_of)) fail(`NOW.md: "Where it is right now (as of ...)" heading must carry as_of ${fm.as_of}`)
    if (!/^# .+/m.test(body)) fail('NOW.md: missing H1 title')

    // Rolling window: bullets under "What changed recently" older than 30 days.
    const recent = body.split(/\r?\n## /).find((s) => s.startsWith('What changed recently'))
    if (recent && fm.as_of) {
      const asOf = new Date(fm.as_of + 'T00:00:00Z').getTime()
      for (const m of recent.matchAll(/^- \*?\*?(\d{4}-\d{2}-\d{2})/gm)) {
        const age = (asOf - new Date(m[1] + 'T00:00:00Z').getTime()) / 86400000
        if (age > 30) fail(`NOW.md: "What changed recently" bullet dated ${m[1]} is ${Math.round(age)} days old; roll it into the history log`)
      }
    }
  }
}

// ------------------------------------------------------------------ history
const logPath = (fm && fm.history_log) || (entry && entry.history_log) || 'docs/history/LOG.md'
if (!exists(logPath)) fail(`${logPath}: missing`)
else {
  const log = read(logPath)
  if (EM_DASH.test(log)) fail(`${logPath}: em dash present`)
  const dates = [...log.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1])
  if (dates.length === 0) fail(`${logPath}: no "## YYYY-MM-DD" entries`)
  for (let i = 1; i < dates.length; i++) if (dates[i] > dates[i - 1]) fail(`${logPath}: entries out of order, ${dates[i]} appears below ${dates[i - 1]} (newest first)`)
  const badHeadings = [...log.matchAll(/^## (?!\d{4}-\d{2}-\d{2})(.+)$/gm)].map((m) => m[1])
  for (const h of badHeadings) fail(`${logPath}: heading "## ${h}" is not a date`)

  const historyDir = logPath.replace(/\/LOG\.md$/, '')
  if (exists(historyDir)) {
    const walk = (d) => readdirSync(join(repo, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
    for (const rel of walk(historyDir)) {
      const name = basename(rel)
      if (name === 'LOG.md' || name === 'README.md' || !name.endsWith('.md')) continue
      const head = read(rel).split(/\r?\n/).slice(0, 12).join('\n')
      if (!/historical|superseded|archived|retired/i.test(head)) fail(`${rel}: no Historical banner in the first 12 lines (see docs/steward/SCHEMA.md section 3)`)
    }
  }
}

// -------------------------------------------------------------- strict mode
if (strict && fm && fm.head) {
  let ancestor = false
  try { git('cat-file', '-e', fm.head + '^{commit}'); ancestor = true } catch { fail(`NOW.md: head ${fm.head} is not a commit in this clone (fetch more history?)`) }
  if (ancestor) {
    try { git('merge-base', '--is-ancestor', fm.head, 'HEAD') } catch { ancestor = false; fail(`NOW.md: head ${fm.head} is not an ancestor of HEAD`) }
  }
  if (ancestor) {
    const after = git('log', '--format=%h %s', `${fm.head}..HEAD`).split('\n').filter(Boolean)
    const foreign = after.filter((l) => !/^[0-9a-f]+ docs\(steward\):/.test(l))
    for (const l of foreign) fail(`NOW.md: commit after head is not a steward commit, NOW.md is stale: ${l}`)
    const headDate = git('log', '-1', '--format=%cs', fm.head)
    if (fm.as_of && fm.as_of < headDate) fail(`NOW.md: as_of ${fm.as_of} is older than the head commit date ${headDate}`)
  }
}

// ------------------------------------------------------------- diff checks
if (since) {
  let status = ''
  try { status = git('diff', '--name-status', '-M', since, 'HEAD') } catch (e) { fail(`--since ${since}: git diff failed: ${e.message.split('\n')[0]}`) }
  const allow = (entry && entry.write_allowlist ? [...entry.write_allowlist, ...(entry.truth_files || [])] : ['**/*.md']).map(globToRegExp)
  for (const line of status.split('\n').filter(Boolean)) {
    const [code, a, b] = line.split('\t')
    const path = b || a
    if (code.startsWith('D')) fail(`diff: ${a} was deleted. The steward moves files to history, it never deletes.`)
    if (code.startsWith('R') && !/\/history\/|\/_archive\//.test(b)) fail(`diff: ${a} renamed to ${b}, but renames are only allowed into the history or archive directory`)
    if (!allow.some((re) => re.test(path))) fail(`diff: ${path} is outside the write allowlist`)
    if (code.startsWith('M') && path.endsWith('.md')) {
      const before = git('show', `${since}:${path}`).split('\n').length
      const now = read(path).split('\n').length
      if (before >= 20 && now < before * 0.8) {
        const logNow = exists(logPath) ? read(logPath) : ''
        if (!logNow.includes(path)) fail(`diff: ${path} shrank from ${before} to ${now} lines with no line in ${logPath} naming it`)
      }
    }
    if (!code.startsWith('D') && exists(path) && statSync(join(repo, path)).isFile()) {
      const content = read(path)
      for (const rule of SECRET_RULES) if (rule.re.test(content)) fail(`secret: ${path} contains what looks like a ${rule.name}`)
    }
  }
}

// ------------------------------------------------- the harness steward's territory
//
// AGENTS.md is on the markdown allowlist, and part of it belongs to the other
// steward. The canon block is rendered from krishanraja/ai-harness and its start
// marker carries the sha256 of the body it introduces, so an edit inside the
// markers is arithmetic to detect. The docs steward must never make one: the
// harness reconciler would read it as inbound drift and open a proposal against
// a change nobody decided. Editing outside the markers stays entirely free.
{
  const START = /<!--\s*krish-canon:start\s+release=(\S+)\s+sha=([0-9a-f]{12})\s+rendered=(\S+)\s*-->\n([\s\S]*?)\n<!-- krish-canon:end -->/
  const canonFiles = git('ls-files', '*.md', '**/*.md').split('\n').filter(Boolean)
  for (const f of canonFiles) {
    let text
    try { text = read(f) } catch { continue }
    const m = text.match(START)
    if (!m) continue
    const actual = createHash('sha256').update(m[4], 'utf8').digest('hex').slice(0, 12)
    if (actual !== m[2]) {
      fail(`canon: ${f} was edited between the krish-canon markers (body hashes ${actual}, marker says ${m[2]}). That block belongs to krishanraja/ai-harness; the docs steward never writes inside it.`)
    }
  }
}

// -------------------------------------------------------------------- result
if (failures.length) {
  console.error(`Docs steward validation failed for ${relative(process.cwd(), repo) || '.'}:`)
  for (const f of failures) console.error(`- ${f}`)
  process.exit(1)
}
console.log(`Docs steward validation passed: NOW.md${strict ? ' (strict)' : ''}, ${logPath}${since ? `, diff since ${since}` : ''}.`)
