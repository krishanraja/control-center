import { sanitizeVoice } from './_content.js'

// ─────────────────────────────────────────────────────────────────────────────
// Build signals: Krish's own builds as Content Engine supply.
//
// Every Saturday api/scorecard/github-sync.ts reads Krish's commits across
// GITHUB_REPOS and counts them against him as "hours building unasked" (Rule 6,
// docs/plans/one-swing/CHARTER.md). The same commit stream is the best owned
// artifact the publication has, and until this module nothing read it for
// content. Three canon rules say it should:
//
//   - The publication's Built with AI channel needs guests, booking is the
//     bottleneck, so canon keeps "a solo variant running (Krish's own builds,
//     held to the same three-why standard on himself)".
//   - The one-swing charter: "Public by default. Every build is shown or
//     announced the week it exists. The Monday note lists the week's builds."
//   - "Operational exhaust is the content." Krish's commit bodies are already
//     written as editorial.
//
// This module turns one repo-week into one neutral content_ideas source row
// (source_type 'build_signal'). The existing editorial radar then judges it
// independently through the Money of AI and Built with AI lenses, exactly as
// it does a pool headline, and approval creates the one publication child.
// Nothing here writes a piece, picks a channel or names a format.
//
// What it protects:
//   - Five products may be named in content. Everything else is anonymous
//     ("a side build") and the lens is told what it may never reveal.
//   - The Money of AI reads a build for the pricing, packaging, positioning
//     or monetisation decision inside it, never for a figure. Revenue, price,
//     cash and the private rate card are blocked deterministically in
//     api/_editorialRadar.ts, not by prompt.
//
// Spec: docs/CONTENT-ENGINE-BUILD-SIGNALS.md.
// ─────────────────────────────────────────────────────────────────────────────

export type BuildMode = 'named' | 'anonymous'

export interface BuildProduct {
  /** 'owner/repo', lower case. */
  repo: string
  /** Stable key for meta and guards. */
  key: string
  /** The name content may use. Anonymous repos share ANONYMOUS_PUBLIC_NAME. */
  public_name: string
  /** One line the lens reads so it knows what the thing is for. */
  role: string
  mode: BuildMode
  /** What a writer must never reveal about this repo, on top of the defaults. */
  never_reveal: string | null
}

export const ANONYMOUS_PUBLIC_NAME = 'a side build'

/** The five products content may name, with the exact public name for each.
 *  Krish, 2026-09-07: "all other repos should not be specifically named, as
 *  they do not fit the mindmake story as well, but cool stuff built in there
 *  should be usable." */
export const NAMED_BUILD_PRODUCTS: readonly BuildProduct[] = Object.freeze([
  {
    repo: 'krishanraja/control-center',
    key: 'control_center',
    public_name: 'Control Center',
    role: 'the OS that runs the business: one dashboard over the agent fleet, the content engine, the room and the scorecard',
    mode: 'named',
    never_reveal: 'Supabase project ids, credential names, the private rate card, any named lead or contact',
  },
  {
    repo: 'krishanraja/mindmake',
    key: 'mindmake_site',
    public_name: 'the Mindmake site',
    role: 'mindmake.co, the public site for the advisory, and the business canon that governs it',
    mode: 'named',
    never_reveal: 'the private price, duration or rate card, client names outside the consented proof set, deployment ids',
  },
  {
    repo: 'krishanraja/mm-ctrl',
    key: 'ctrl',
    public_name: 'CTRL',
    role: 'the AI brain product: a personal AI that holds a leader\'s judgement and standards',
    mode: 'named',
    never_reveal: 'any login or credential, Supabase project ids, unreleased pricing',
  },
  {
    repo: 'krishanraja/contentarchives',
    key: 'contentarchives',
    public_name: 'contentarchives',
    role: 'the engine that keeps machines and cloud accounts clean: dedupe, dating, safe deletion, rescue',
    mode: 'named',
    never_reveal: 'family names, personal folder names, identity or medical documents, local paths with a user name',
  },
  {
    repo: 'krishanraja/mindmake-video-studio',
    key: 'video_studio',
    public_name: 'video-studio',
    role: 'the bespoke AI video production agency: a governed render engine, carousel engine and review surface',
    mode: 'named',
    never_reveal: 'Drive paths, Supabase project ids, credential target names, any client or guest name in config',
  },
])

/** Extra never-reveal notes for anonymous repos whose purpose is itself
 *  private. Any repo not listed here or above is anonymous with the default
 *  note only. */
const ANONYMOUS_NOTES: Readonly<Record<string, string>> = Object.freeze({
  'krishanraja/hunter': 'the purpose of this tool (a job search), any company, role or person it evaluates, and the sheet it writes to',
  'krishanraja/full-time': 'the product name and domain, the sport, any team, player, data provider or voice vendor',
})

const DEFAULT_ANONYMOUS_NOTE = 'the repository name, the product name, its domain and any customer or user of it'

const NAMED_BY_REPO = new Map(NAMED_BUILD_PRODUCTS.map(p => [p.repo, p]))

export function normalizeRepo(repo: string): string {
  return repo.trim().toLowerCase().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
}

export function buildProductFor(repo: string): BuildProduct {
  const key = normalizeRepo(repo)
  const named = NAMED_BY_REPO.get(key)
  if (named) return named
  const extra = ANONYMOUS_NOTES[key]
  return {
    repo: key,
    key: `anon:${key.split('/').pop() || key}`,
    public_name: ANONYMOUS_PUBLIC_NAME,
    role: 'a side build outside the five named products',
    mode: 'anonymous',
    never_reveal: extra ? `${DEFAULT_ANONYMOUS_NOTE}; ${extra}` : DEFAULT_ANONYMOUS_NOTE,
  }
}

/** Words that, appearing in a candidate about an anonymous repo, mean the
 *  lens named it. Derived from the repo name so the guard needs no list. */
export function forbiddenTermsFor(product: BuildProduct): string[] {
  if (product.mode !== 'anonymous') return []
  const short = product.repo.split('/').pop() || product.repo
  const spaced = short.replace(/[-_]+/g, ' ')
  const joined = short.replace(/[-_]+/g, '')
  return [...new Set([short, spaced, joined].filter(t => t.length >= 4))]
}

// ── GitHub reads ─────────────────────────────────────────────────────────────

export interface BuildCommit {
  sha: string
  subject: string
  body: string
  url: string
  authored_at: string
  /** PR number when the commit is a squash or merge for one, else null. */
  pr: number | null
}

export interface BuildPr {
  number: number
  title: string
  body: string
  url: string
  merged_at: string
}

export interface RepoWeekBuild {
  repo: string
  product: BuildProduct
  week_ending: string
  since: string
  until: string
  commits: BuildCommit[]
  prs: BuildPr[]
  /** Compare URL for the window on GitHub, or the repo URL when the window
   *  holds a single commit. */
  compare_url: string
  files_changed: number | null
  additions: number | null
  deletions: number | null
  doc_excerpts: { path: string; text: string }[]
}

const MAX_PAGES = 10
const LONG_BODY_CHARS = 200
const MAX_LONG_BODIES = 8
const MAX_DOC_EXCERPT = 1200
/** Docs a repo may carry that read as a build log. First present wins, and
 *  only when a commit in the window touched it. docs/history/LOG.md is the
 *  docs steward's chronological log (control-center docs/steward/SCHEMA.md):
 *  NOW.md's dated change bullets roll into it after 30 days. */
export const BUILD_LOG_CANDIDATES = ['docs/LEARNINGS.md', 'docs/BUILD-LOG.md', 'docs/BUILD_LOG.md', 'docs/history/LOG.md', 'CHANGELOG.md', 'docs/BUILD-CHRONICLE.md'] as const

/** The docs steward's router file at every fleet repo's root. When it exists
 *  it replaces the README opening as the lens's context: its three sections
 *  below were written for exactly this reader, and its frontmatter may carry
 *  a never_publish list the repo knows better than the registry. */
export const NOW_FILE = 'NOW.md'
export const NOW_SECTIONS = ['What it is', 'Who it is for and why it matters for Mindmake', 'What changed recently'] as const

export interface NowExcerpt { text: string; never_publish: string[] }

/** Pull the lens-facing sections and the never_publish list out of a NOW.md
 *  body. Pure, so the guard can exercise it. Unknown shapes degrade to an
 *  empty excerpt rather than a throw: a malformed NOW.md must not cost the
 *  repo its week. */
export function nowExcerpt(text: string): NowExcerpt {
  const never: string[] = []
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  const body = fm ? text.slice(fm[0].length) : text
  const line = fm ? fm[1].split(/\r?\n/).find(l => /^never_publish:/.test(l.trim())) : undefined
  if (line) {
    const inner = line.slice(line.indexOf(':') + 1).trim().replace(/^\[|\]$/g, '')
    for (const item of inner.split(',')) {
      const v = item.trim().replace(/^["']|["']$/g, '')
      if (v) never.push(v)
    }
  }
  const parts: string[] = []
  for (const chunk of body.split(/\r?\n(?=## )/)) {
    const heading = (chunk.match(/^## (.+)$/m) || [])[1]?.trim()
    if (!heading) continue
    if (NOW_SECTIONS.some(s => heading === s || heading.startsWith(`${s} (`))) parts.push(chunk.trim())
  }
  const joined = parts.join('\n\n')
  return { text: joined.length > MAX_DOC_EXCERPT * 2 ? `${joined.slice(0, MAX_DOC_EXCERPT * 2)}\n...` : joined, never_publish: never }
}

/** The registry's note plus whatever the repo's NOW.md says must never be
 *  published. The repo knows its own secrets better than a central list. */
export function withNeverPublish(product: BuildProduct, extra: string[]): BuildProduct {
  const items = extra.map(s => s.trim()).filter(Boolean)
  if (!items.length) return product
  return { ...product, never_reveal: [product.never_reveal, ...items].filter(Boolean).join('; ') }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'control-center-build-signals',
  }
}

function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

async function gh<T>(url: string, token: string): Promise<{ status: number; body: T | null; link: string | null }> {
  const r = await fetch(url, { headers: headers(token) })
  if (r.status === 409 || r.status === 404) return { status: r.status, body: null, link: null }
  if (!r.ok) throw new Error(`github ${url.replace(/\?.*$/, '')}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`)
  return { status: r.status, body: (await r.json()) as T, link: r.headers.get('link') }
}

interface RawCommit {
  sha: string
  html_url: string
  commit: { message: string; author?: { date?: string } | null; committer?: { date?: string } | null }
  parents?: { sha: string }[]
}

interface RawPr {
  number: number
  title: string
  body: string | null
  html_url: string
  merged_at: string | null
  user?: { login?: string } | null
}

const MERGE_PR = /^Merge pull request #(\d+)\b/
const SQUASH_PR = /\(#(\d+)\)\s*$/
const MERGE_BRANCH = /^Merge (remote-tracking )?branch\b/

export function parseCommitMessage(message: string): { subject: string; body: string; pr: number | null; skip: boolean } {
  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const subject = (lines[0] || '').trim()
  const rest = lines.slice(1).join('\n').trim()
  const merge = subject.match(MERGE_PR)
  if (merge) return { subject, body: rest, pr: Number(merge[1]), skip: true }
  if (MERGE_BRANCH.test(subject)) return { subject, body: rest, pr: null, skip: true }
  const squash = subject.match(SQUASH_PR)
  return { subject, body: rest, pr: squash ? Number(squash[1]) : null, skip: false }
}

/** Every non-merge commit by the author in [since, until), newest first,
 *  with its full message. The list endpoint returns messages whole. */
export async function fetchCommits(repo: string, author: string, token: string, since: string, until: string): Promise<{ commits: BuildCommit[]; oldestParent: string | null; prNumbersFromMerges: number[] }> {
  const params = new URLSearchParams({ since, until, per_page: '100' })
  if (author) params.set('author', author)
  let url: string | null = `https://api.github.com/repos/${repo}/commits?${params.toString()}`
  const out: BuildCommit[] = []
  const merges: number[] = []
  let oldestParent: string | null = null
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const { body, link } = await gh<RawCommit[]>(url, token)
    if (!body) break
    for (const c of body) {
      const parsed = parseCommitMessage(c.commit.message || '')
      oldestParent = c.parents?.[0]?.sha || oldestParent
      if (parsed.skip) {
        if (parsed.pr) merges.push(parsed.pr)
        continue
      }
      out.push({
        sha: c.sha,
        subject: parsed.subject,
        body: parsed.body,
        url: c.html_url,
        authored_at: c.commit.author?.date || c.commit.committer?.date || since,
        pr: parsed.pr,
      })
    }
    url = nextLink(link)
  }
  return { commits: out, oldestParent, prNumbersFromMerges: merges }
}

/** PRs merged in [since, until). Closed PRs sorted by update time, two pages
 *  at most; a repo merging more than 100 PRs a week is not this one. */
export async function fetchMergedPrs(repo: string, token: string, since: string, until: string): Promise<BuildPr[]> {
  const out: BuildPr[] = []
  let url: string | null = `https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`
  for (let page = 0; page < 2 && url; page += 1) {
    const { body, link } = await gh<RawPr[]>(url, token)
    if (!body) break
    let sawOlder = false
    for (const pr of body) {
      if (!pr.merged_at) continue
      if (pr.merged_at < since) { sawOlder = true; continue }
      if (pr.merged_at >= until) continue
      out.push({ number: pr.number, title: pr.title, body: (pr.body || '').trim(), url: pr.html_url, merged_at: pr.merged_at })
    }
    if (sawOlder) break
    url = nextLink(link)
  }
  return out.sort((a, b) => (a.merged_at < b.merged_at ? 1 : -1))
}

interface RawCompare {
  files?: { filename: string; additions: number; deletions: number }[]
  total_commits?: number
}

/** Diffstat and touched paths for the window, from one compare call. Best
 *  effort: a non-linear history or a missing parent returns nulls. */
export async function fetchCompare(repo: string, token: string, base: string, head: string): Promise<{ files_changed: number | null; additions: number | null; deletions: number | null; paths: string[] }> {
  try {
    const { body } = await gh<RawCompare>(`https://api.github.com/repos/${repo}/compare/${base}...${head}`, token)
    const files = body?.files || []
    return {
      files_changed: files.length,
      additions: files.reduce((n, f) => n + (f.additions || 0), 0),
      deletions: files.reduce((n, f) => n + (f.deletions || 0), 0),
      paths: files.map(f => f.filename),
    }
  } catch {
    return { files_changed: null, additions: null, deletions: null, paths: [] }
  }
}

interface RawContent { content?: string; encoding?: string }

async function fetchFileText(repo: string, token: string, path: string, ref: string): Promise<string | null> {
  const { body } = await gh<RawContent>(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, token)
  if (!body?.content) return null
  try {
    return Buffer.from(body.content.replace(/\n/g, ''), body.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
  } catch {
    return null
  }
}

/** NOW.md's lens-facing sections when the repo carries one, else the README
 *  opening; plus the first build-log candidate a commit in the window touched.
 *  The first tells the lens what the thing is and why Mindmake's buyer should
 *  care; the log carries the dated reasons a writer needs. */
export async function fetchDocExcerpts(repo: string, token: string, head: string, touchedPaths: string[], now: NowExcerpt | null = null): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = []
  if (now && now.text) out.push({ path: NOW_FILE, text: now.text })
  else {
    const readme = await fetchFileText(repo, token, 'README.md', head).catch(() => null)
    if (readme) out.push({ path: 'README.md', text: readme.slice(0, 600) })
  }
  const touched = new Set(touchedPaths)
  const log = BUILD_LOG_CANDIDATES.find(p => touched.has(p))
  if (log) {
    const text = await fetchFileText(repo, token, log, head).catch(() => null)
    // The newest entries sit at the top of a changelog and the bottom of a
    // numbered learnings file; take both ends so either convention reads.
    if (text) out.push({ path: log, text: text.length > MAX_DOC_EXCERPT * 2 ? `${text.slice(0, MAX_DOC_EXCERPT)}\n...\n${text.slice(-MAX_DOC_EXCERPT)}` : text })
  }
  return out
}

export async function fetchRepoWeek(repo: string, author: string, token: string, weekEnding: string, since: string, until: string): Promise<RepoWeekBuild | null> {
  const key = normalizeRepo(repo)
  const { commits, oldestParent, prNumbersFromMerges } = await fetchCommits(key, author, token, since, until)
  if (!commits.length && !prNumbersFromMerges.length) return null
  const prs = await fetchMergedPrs(key, token, since, until)
  const head = commits[0]?.sha || null
  const base = oldestParent
  let compare = { files_changed: null as number | null, additions: null as number | null, deletions: null as number | null, paths: [] as string[] }
  let compareUrl = `https://github.com/${key}`
  if (head && base && head !== base) {
    compare = await fetchCompare(key, token, base, head)
    compareUrl = `https://github.com/${key}/compare/${base.slice(0, 12)}...${head.slice(0, 12)}`
  } else if (head) {
    compareUrl = `https://github.com/${key}/commit/${head}`
  }
  const nowText = head ? await fetchFileText(key, token, NOW_FILE, head).catch(() => null) : null
  const now = nowText ? nowExcerpt(nowText) : null
  const docs = head ? await fetchDocExcerpts(key, token, head, compare.paths, now).catch(() => []) : []
  return {
    repo: key,
    product: withNeverPublish(buildProductFor(key), now?.never_publish ?? []),
    week_ending: weekEnding,
    since,
    until,
    commits,
    prs,
    compare_url: compareUrl,
    files_changed: compare.files_changed,
    additions: compare.additions,
    deletions: compare.deletions,
    doc_excerpts: docs,
  }
}

// ── The signal row ───────────────────────────────────────────────────────────

export interface BuildMeta {
  repo: string
  product_key: string
  public_name: string
  role: string
  mode: BuildMode
  never_reveal: string | null
  week_ending: string
  since: string
  until: string
  commit_count: number
  pr_count: number
  files_changed: number | null
  additions: number | null
  deletions: number | null
  prs: { number: number; title: string; url: string; body: string }[]
  commits: { sha: string; subject: string; url: string; pr: number | null }[]
  /** The commit and PR bodies over LONG_BODY_CHARS: the editorial ones. */
  highlights: { ref: string; title: string; body: string; url: string }[]
  doc_excerpts: { path: string; text: string }[]
}

const clean = (s: string, max: number): string => sanitizeVoice(String(s || '')).replace(/\s+$/g, '').slice(0, max)

export function buildMetaFor(week: RepoWeekBuild): BuildMeta {
  const highlights: BuildMeta['highlights'] = []
  for (const pr of week.prs) {
    if (pr.body.length >= LONG_BODY_CHARS) highlights.push({ ref: `#${pr.number}`, title: clean(pr.title, 200), body: clean(pr.body, 2400), url: pr.url })
  }
  for (const c of week.commits) {
    if (c.body.length >= LONG_BODY_CHARS) highlights.push({ ref: c.sha.slice(0, 7), title: clean(c.subject, 200), body: clean(c.body, 2400), url: c.url })
  }
  return {
    repo: week.repo,
    product_key: week.product.key,
    public_name: week.product.public_name,
    role: week.product.role,
    mode: week.product.mode,
    never_reveal: week.product.never_reveal,
    week_ending: week.week_ending,
    since: week.since,
    until: week.until,
    commit_count: week.commits.length,
    pr_count: week.prs.length,
    files_changed: week.files_changed,
    additions: week.additions,
    deletions: week.deletions,
    prs: week.prs.map(p => ({ number: p.number, title: clean(p.title, 200), url: p.url, body: clean(p.body, 1200) })),
    commits: week.commits.map(c => ({ sha: c.sha.slice(0, 12), subject: clean(c.subject, 200), url: c.url, pr: c.pr })),
    highlights: highlights.slice(0, MAX_LONG_BODIES),
    doc_excerpts: week.doc_excerpts.map(d => ({ path: d.path, text: clean(d.text, MAX_DOC_EXCERPT * 2 + 8) })),
  }
}

/** The three subjects most likely to carry the week's story: PR titles with
 *  the longest bodies first (a body that explains itself is the editorial
 *  one), then the commits with the longest bodies. */
export function leadSubjects(week: RepoWeekBuild, n = 3): string[] {
  const fromPrs = [...week.prs].sort((a, b) => b.body.length - a.body.length).map(p => p.title)
  const fromCommits = [...week.commits].sort((a, b) => b.body.length - a.body.length).map(c => c.subject)
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of [...fromPrs, ...fromCommits]) {
    const k = s.toLowerCase()
    if (!s || seen.has(k)) continue
    seen.add(k)
    out.push(clean(s, 160))
    if (out.length >= n) break
  }
  return out
}

export interface BuildSignalRow {
  idea: string
  thesis: string
  source_type: 'build_signal'
  source_ref: string
  source_url: string
  source_snippet: string | null
  source_captured_at: string
  state: 'seeded'
  origin: 'agent'
  assigned_to: 'cleo'
  lane: 'publication'
  horizon: 'news'
  /** A build week is time-bound supply: undecided after SIGNAL_TTL_DAYS it
   *  expires like any other seed (api/purge/run.ts). The story Krish approves
   *  from it is the evergreen row, written by the editorial route. */
  expires_at: string
  distribution: string[]
  meta: {
    mindmake_build: true
    source_label: string
    build: BuildMeta
  }
}

export function buildSourceRef(repo: string, weekEnding: string): string {
  return `build:${normalizeRepo(repo)}:${weekEnding}`
}

/** How long an undecided build signal stays on offer. Three weeks matches the
 *  radar's build lookback (api/content-opportunities/refresh.ts) and the seed
 *  rail's window (api/_seedSources.ts); a build week older than that is a
 *  stale seed, and the pile stays structurally bounded. */
export const SIGNAL_TTL_DAYS = 21

export function buildSignalRow(week: RepoWeekBuild, now = new Date()): BuildSignalRow {
  const meta = buildMetaFor(week)
  const subjects = leadSubjects(week)
  const first = meta.highlights[0]
  return {
    idea: clean(`${week.product.public_name}: the week's build, week ending ${week.week_ending}`, 200),
    thesis: clean(subjects.join('; '), 500),
    source_type: 'build_signal',
    source_ref: buildSourceRef(week.repo, week.week_ending),
    source_url: week.compare_url,
    source_snippet: first ? clean(`${first.title}. ${first.body}`, 400) : (subjects[0] || null),
    source_captured_at: now.toISOString(),
    state: 'seeded',
    origin: 'agent',
    assigned_to: 'cleo',
    lane: 'publication',
    horizon: 'news',
    expires_at: new Date(now.getTime() + SIGNAL_TTL_DAYS * 86_400_000).toISOString(),
    distribution: [],
    meta: {
      mindmake_build: true,
      source_label: `Mindmake build, ${week.product.public_name}`,
      build: meta,
    },
  }
}

// ── What the lens reads ──────────────────────────────────────────────────────

const SUMMARY_CAP = 3500

/** One plain-text digest of the week for the editorial radar. Subjects first
 *  (they are already editorial), then the long bodies, then the docs. Capped
 *  so twenty signals still fit one lens call. */
export function buildSignalSummary(meta: BuildMeta): string {
  const parts: string[] = []
  parts.push(`${meta.public_name}: ${meta.role}.`)
  parts.push(`Week ending ${meta.week_ending}: ${meta.commit_count} commits, ${meta.pr_count} merged PRs${meta.files_changed != null ? `, ${meta.files_changed} files, +${meta.additions ?? 0} -${meta.deletions ?? 0}` : ''}.`)
  if (meta.prs.length) parts.push(`Merged: ${meta.prs.map(p => p.title).join(' | ')}`)
  const subjects = meta.commits.map(c => c.subject).filter(Boolean)
  if (subjects.length) parts.push(`Commits: ${subjects.slice(0, 40).join(' | ')}`)
  for (const h of meta.highlights) parts.push(`[${h.ref}] ${h.title}\n${h.body}`)
  for (const d of meta.doc_excerpts) parts.push(`[${d.path}]\n${d.text}`)
  const joined = parts.join('\n\n')
  return joined.length > SUMMARY_CAP ? `${joined.slice(0, SUMMARY_CAP - 1)}…` : joined
}
