// check-build-signals: the invariants behind "Krish's own builds as content".
//
// docs/CONTENT-ENGINE-BUILD-SIGNALS.md. Each assertion encodes a way this
// feature can go quietly wrong:
//
//   the registry      exactly five products may be named in content, each by
//                     its agreed public name; everything else is anonymous.
//                     A sixth named entry, or a renamed one, is a canon
//                     breach that no type checker sees.
//   the vocabulary    'build_signal' must exist in the CHECK constraint, the
//                     API allowlist and the client union together, or the
//                     failure lands at write time inside a Saturday cron
//                     (the check-content-vocabulary pattern).
//   the money gate    a Money of AI candidate on a build that discloses a
//                     figure is rejected in code, not by prompt.
//   the anonymity gate a candidate that names an anonymous repo is rejected.
//   the wiring        the radar reads both source types, the cron is
//                     registered, a build signal never claims an evergreen
//                     expiry (that is the routed child's), and the routed
//                     child keeps the flag.
//
//   npx tsx scripts/check-build-signals.mts
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ANONYMOUS_PUBLIC_NAME,
  NAMED_BUILD_PRODUCTS,
  buildProductFor,
  buildSignalRow,
  buildSignalSummary,
  buildMetaFor,
  forbiddenTermsFor,
  parseCommitMessage,
  type RepoWeekBuild,
} from '../api/_buildSignals.ts'
import {
  MONEY_FIGURE,
  buildEditorialLensSystemPrompt,
  parseEditorialLensResponse,
  type EditorialSignalV2,
} from '../api/_editorialRadar.ts'

const root = new URL('..', import.meta.url)
const read = (rel: string) => readFileSync(new URL(rel, root), 'utf8')

// ── The registry ─────────────────────────────────────────────────────────────
const expected: Record<string, string> = {
  'krishanraja/control-center': 'Control Center',
  'krishanraja/mindmake': 'the Mindmake site',
  'krishanraja/mm-ctrl': 'CTRL',
  'krishanraja/contentarchives': 'contentarchives',
  'krishanraja/mindmake-video-studio': 'video-studio',
}
assert.equal(NAMED_BUILD_PRODUCTS.length, 5, 'exactly five products may be named in content')
for (const p of NAMED_BUILD_PRODUCTS) {
  assert.equal(p.mode, 'named')
  assert.equal(expected[p.repo], p.public_name, `public name for ${p.repo}`)
  assert.ok(p.never_reveal && p.never_reveal.length > 10, `${p.repo} carries a never-reveal note`)
}
const hunter = buildProductFor('krishanraja/hunter')
assert.equal(hunter.mode, 'anonymous')
assert.equal(hunter.public_name, ANONYMOUS_PUBLIC_NAME)
assert.match(hunter.never_reveal || '', /job search/i, 'the job-search purpose is on the never-reveal list')
const other = buildProductFor('https://github.com/krishanraja/Some-Other-Repo.git')
assert.equal(other.mode, 'anonymous')
assert.equal(other.repo, 'krishanraja/some-other-repo')
assert.deepEqual(forbiddenTermsFor(hunter), ['hunter'])
assert.ok(forbiddenTermsFor(buildProductFor('krishanraja/full-time')).includes('full time'))
assert.deepEqual(forbiddenTermsFor(buildProductFor('krishanraja/mm-ctrl')), [], 'named products have no forbidden terms')

// ── Commit parsing ───────────────────────────────────────────────────────────
assert.deepEqual(parseCommitMessage('Merge pull request #276 from krishanraja/feat/x\n\nfeat: unify'), { subject: 'Merge pull request #276 from krishanraja/feat/x', body: 'feat: unify', pr: 276, skip: true })
assert.equal(parseCommitMessage('Add the Spend tab (#258)\n\nbody').pr, 258)
assert.equal(parseCommitMessage('Merge remote-tracking branch \'origin/main\' into feat').skip, true)
assert.equal(parseCommitMessage('The curtain was never there\n\nThe root marker shared the class.').skip, false)

// ── The row and its digest ───────────────────────────────────────────────────
const week: RepoWeekBuild = {
  repo: 'krishanraja/control-center',
  product: buildProductFor('krishanraja/control-center'),
  week_ending: '2026-09-11',
  since: '2026-09-05T04:00:00.000Z',
  until: '2026-09-12T03:59:59.999Z',
  commits: [
    { sha: 'abcdef1234567890', subject: 'Retire Kai, rebuild n8n parity', body: 'It ran every 4 hours and returned issues_detected 83 consecutive times into a void. ' + 'x'.repeat(200), url: 'https://github.com/krishanraja/control-center/commit/abcdef1234567890', authored_at: '2026-09-07T10:00:00Z', pr: 270 },
    { sha: '1234567890abcdef', subject: 'Fix a typo', body: '', url: 'https://github.com/krishanraja/control-center/commit/1234567890abcdef', authored_at: '2026-09-07T11:00:00Z', pr: null },
  ],
  prs: [{ number: 270, title: 'Rebuild n8n git/cloud parity, retire Kai', body: 'git claimed to be the source of truth while holding 43 snapshots against 123 cloud workflows.', url: 'https://github.com/krishanraja/control-center/pull/270', merged_at: '2026-09-07T12:00:00Z' }],
  compare_url: 'https://github.com/krishanraja/control-center/compare/aaaaaaaaaaaa...bbbbbbbbbbbb',
  files_changed: 12,
  additions: 400,
  deletions: 90,
  doc_excerpts: [{ path: 'README.md', text: 'The single pane of glass for mind/make OS.' }],
}
const row = buildSignalRow(week, new Date('2026-09-12T05:00:00Z'))
assert.equal(row.source_type, 'build_signal')
assert.equal(row.source_ref, 'build:krishanraja/control-center:2026-09-11')
assert.equal(row.horizon, 'news', 'a build week is time-bound supply; the approved story is the evergreen row')
assert.equal(row.expires_at, '2026-10-03T05:00:00.000Z', 'undecided after 21 days it expires like any seed')
assert.equal(row.lane, 'publication')
assert.equal(row.meta.mindmake_build, true)
assert.equal(row.meta.build.public_name, 'Control Center')
assert.equal(row.meta.build.highlights.length, 1, 'only the long commit body is a highlight')
assert.doesNotMatch(JSON.stringify(row), /\u2014/, 'no em dashes are stored')
const summary = buildSignalSummary(buildMetaFor(week))
assert.match(summary, /Control Center: the OS that runs the business/)
assert.match(summary, /83 consecutive times/)
assert.ok(summary.length <= 3500)

// ── The lens rules ───────────────────────────────────────────────────────────
const withBuild = buildEditorialLensSystemPrompt('built_with_ai', '', '', true)
assert.match(withBuild, /solo variant/i)
assert.match(withBuild, /third why/i)
const moneyWithBuild = buildEditorialLensSystemPrompt('money_of_ai', '', '', true)
assert.match(moneyWithBuild, /Never state revenue, price, cash, MRR/)
const without = buildEditorialLensSystemPrompt('money_of_ai', '', '')
assert.doesNotMatch(without, /MINDMAKE BUILDS/, 'the build block is appended only when the batch carries a build')

assert.ok(MONEY_FIGURE.test('the proof is $15,000 a month'))
assert.ok(MONEY_FIGURE.test('MRR moved'))
assert.ok(MONEY_FIGURE.test('revenue was 40k'))
assert.ok(!MONEY_FIGURE.test('the price is private and the duration is agreed with it'))
assert.ok(!MONEY_FIGURE.test('a run costs about a tenth of a full one'))

const base = {
  status: 'candidate',
  audience_problem: 'Leaders cannot tell what a private price is doing for them.',
  why_now: 'The site just removed its last public number.',
  proposed_hook: 'A services site with no price and no duration is not hiding.',
  honest_payoff: 'A rule for which numbers belong on a sales page.',
  visual_proof: 'The before and after of the page.',
  source_mode: 'short_native',
  production_effort: 'low',
  strongest_failure: 'It may read as coy.',
  safer_version: 'Explain the decision.',
  ambitious_version: 'Argue every services site should do it.',
  recommended_version: 'Explain the decision.',
  recommendation_reason: 'It is what happened.',
  credible_contradiction: 'Buyers may want an anchor.',
  editorial: { truth: true, evidence: true, confidentiality: true, rights: true, series_fit: true, meaningful_mechanism: true },
  growth: { first_beat_tension: 8, clarity: 8, surprise: 7, payoff: 8, delivery_strength: 7, visual_proof: 7, share_save_usefulness: 8, qualified_audience_fit: 9, novelty: 7 },
}
const namedSignal: EditorialSignalV2 = {
  id: 'b1', title: 'the Mindmake site: the week\'s build', summary: 'x', occurred_at: '2026-09-12T05:00:00Z',
  source_urls: ['https://github.com/krishanraja/mindmake/compare/a...b'], corroboration: 29, category: 'mindmake_build',
  build: { public_name: 'the Mindmake site', role: 'the public site', mode: 'named', never_reveal: 'the private price', forbidden_terms: [] },
}
const clean = parseEditorialLensResponse({ opportunities: [{ ...base, signal_id: 'b1',
  title: 'Why the Mindmake site removed its last public number',
  angle: 'Once the fee is private, a public duration is the only number left to anchor on, and it anchors on the calendar instead of the result.',
  mechanism: 'Pricing anchors move to whatever number remains public; removing the duration moves the buyer back to the outcome.',
}] }, 'money_of_ai', [namedSignal])[0]
assert.equal(clean.status, 'eligible', clean.hard_blocks.join('; '))

const leaked = parseEditorialLensResponse({ opportunities: [{ ...base, signal_id: 'b1',
  title: 'Why the proof is a $15,000 month',
  angle: 'The site removed the duration but the pricing decision is the story.',
  mechanism: 'Pricing anchors move to whatever number remains public.',
}] }, 'money_of_ai', [namedSignal])[0]
assert.equal(leaked.status, 'rejected')
assert.ok(leaked.hard_blocks.some(b => /revenue or price figure/.test(b)), leaked.hard_blocks.join('; '))

const anonSignal: EditorialSignalV2 = {
  ...namedSignal, id: 'b2', title: 'a side build: the week\'s build',
  build: { public_name: ANONYMOUS_PUBLIC_NAME, role: 'a side build', mode: 'anonymous', never_reveal: hunter.never_reveal, forbidden_terms: forbiddenTermsFor(hunter) },
}
const named = parseEditorialLensResponse({ opportunities: [{ ...base, signal_id: 'b2',
  title: 'The hunter agent learned from its own decisions',
  angle: 'A feedback loop with one channel for human and machine writes trains on itself.',
  mechanism: 'The re-gate wrote its verdict where the owner wrote his, and the learner read both as taste.',
}] }, 'built_with_ai', [anonSignal])[0]
assert.equal(named.status, 'rejected')
assert.ok(named.hard_blocks.some(b => /names an anonymous build/.test(b)), named.hard_blocks.join('; '))
const anon = parseEditorialLensResponse({ opportunities: [{ ...base, signal_id: 'b2',
  title: 'The agent that learned from its own decisions',
  angle: 'A feedback loop with one channel for human and machine writes trains on itself.',
  mechanism: 'The re-gate wrote its verdict where the owner wrote his, and the learner read both as taste.',
}] }, 'built_with_ai', [anonSignal])[0]
assert.equal(anon.status, 'eligible', anon.hard_blocks.join('; '))

// ── The vocabulary, in three places ─────────────────────────────────────────
const migrationDir = new URL('supabase/migrations/', root)
const migrations = readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()
const latestCheck = [...migrations].reverse().map(f => readFileSync(join(migrationDir.pathname, f), 'utf8')).find(s => /content_ideas_source_type_check/.test(s))
assert.ok(latestCheck && /'build_signal'/.test(latestCheck), 'the newest content_ideas_source_type_check migration declares build_signal')
assert.ok(latestCheck && /content_ideas_build_signal_ref_live_uq/.test(latestCheck), 'one live source row per repo-week is enforced at the database')
assert.match(read('api/content-ideas.ts'), /'build_signal',\n\]\)/, 'ALLOWED_SOURCE carries build_signal')
assert.match(read('src/hooks/useRealtimeContentIdeas.ts'), /\| 'build_signal'/, 'IdeaSourceType carries build_signal')
assert.match(read('src/components/LeadSourcePill.tsx'), /build_signal:\s+\{ label: 'Mindmake build'/, 'the provenance chip names it')

// ── The wiring ───────────────────────────────────────────────────────────────
const refresh = read('api/content-opportunities/refresh.ts')
assert.match(refresh, /RADAR_SOURCE_TYPES = \['pool_headline', 'build_signal', 'aeo_signal'\]/, 'the radar judges headlines, builds and AEO recommendations, and nothing else')
assert.match(refresh, /buildEditorialLensSystemPrompt\(series, voice, corpusForChannel\(corpus, series\), hasBuild\)/)
const cron = read('api/discover-build-signals.ts')
assert.match(cron, /guardCronRoute\(req, res\)/)
assert.match(cron, /github_not_configured/, 'an unconfigured run says so instead of writing a quiet week')
assert.match(cron, /backlog_governor/)
assert.doesNotMatch(cron, /callClaude|ANTHROPIC_API_KEY/, 'the ingest never calls a model; the radar does the judging')
const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[]; functions: Record<string, unknown> }
const registered = vercel.crons.find(c => c.path === '/api/discover-build-signals')
assert.ok(registered, 'the Saturday cron is registered')
assert.equal(registered?.schedule, '0 5 * * 6', 'it runs after github-sync at 04:00')
assert.ok(vercel.functions['api/discover-build-signals.ts'], 'the function has a duration budget')
assert.doesNotMatch(read('api/_buildSignals.ts'), /expires_at:\s*null/, 'a build signal never claims an evergreen expiry; that is the editorial route child')
assert.match(read('api/content-ideas/[id]/editorial-route.ts'), /meta\.mindmake_build \? \{ mindmake_build: true/, 'the routed child keeps the flag')
assert.match(read('api/scorecard/monday.ts'), /Built last week/, 'the Monday note lists the week\'s builds')
assert.doesNotMatch(read('api/scorecard/github-sync.ts'), /process\.env\.GITHUB_AUTHOR|URLSearchParams\(\{ author/, 'the tripwire counts every commit in the repo, never one login (2026-09-07)')
assert.doesNotMatch(cron, /process\.env\.GITHUB_AUTHOR/, 'the ingest reads every commit in the repo too')

// ── The architecture doc: one surface, kept current by the engine ────────────
const { composeWeekEntry, applyWeekEntry, CHANGELOG_HEADING } = await import('../api/_architectureDoc.ts')
const doc = read('docs/MINDMAKE_OS_ARCHITECTURE.md')
assert.doesNotMatch(doc.slice(0, 20000), /six places|byte-identical across/, 'the header no longer claims a six-surface inventory')
assert.match(doc.slice(0, 20000), /\*\*Last engine refresh:\*\* (\d{4}-\d{2}-\d{2}|never)/, 'the header carries the engine stamp')
assert.match(doc, /^## 0c\. CANON as of 2026-09-07/m, 'the one-surface ruling is recorded')
assert.ok(doc.includes(CHANGELOG_HEADING), 'the changelog heading the engine inserts under still exists')
const entry = composeWeekEntry('2026-09-11', '2026-09-13', [
  { idea: 'x', source_captured_at: null, meta: { build: { repo: 'krishanraja/control-center', commit_count: 34, pr_count: 2, files_changed: 300, additions: 15283, deletions: 1640, prs: [{ title: 'Add the Room' }, { title: 'Add the scorecard' }] }, editorial_radar: { lenses: { built_with_ai: { status: 'eligible' }, money_of_ai: { status: 'near_miss' } } } } },
  { idea: 'y', source_captured_at: null, meta: { build: { repo: 'krishanraja/hunter', commit_count: 38, pr_count: 0, prs: [{ title: 'Read Krish\'s verdicts back' }] } } },
])
assert.match(entry, /\*\*Control Center\*\*: 34 commits, 2 merged PRs, 300 files/)
assert.match(entry, /Built with AI an angle ready, The Money of AI a near miss/)
assert.match(entry, /\*\*a side builds\*\*: 38 commits across 1 repo/)
assert.doesNotMatch(entry, /hunter|verdicts/, 'an anonymous repo never leaks into the public doc')
const once = applyWeekEntry(doc, '2026-09-11', entry, '2026-09-13')
assert.ok(once.next.includes(entry) && !once.replaced, 'first write inserts under the heading')
assert.match(once.next, /\*\*Last engine refresh:\*\* 2026-09-13/)
const twice = applyWeekEntry(once.next, '2026-09-11', entry.replace('34 commits', '35 commits'), '2026-09-14')
assert.ok(twice.replaced && twice.next.includes('35 commits') && !twice.next.includes('34 commits, 2 merged'), 'a re-run replaces the week, never duplicates it')
const weekly = read('api/architecture/weekly.ts')
assert.match(weekly, /\[skip ci\]/, 'the engine commit skips CI')
assert.match(weekly, /github_write_forbidden/, 'a token that cannot write says so instead of faking a refresh')
assert.doesNotMatch(weekly, /sendGmail|callClaude/, 'the doc writer sends nothing and invents nothing')
const archCron = vercel.crons.find(c => c.path === '/api/architecture/weekly')
assert.equal(archCron?.schedule, '0 13 * * 0', 'the Sunday refresh is registered after the Saturday ingest and the Sunday radar')
assert.match(read('api/scorecard/monday.ts'), /Architecture doc: engine refresh stale/, 'the Monday note reads the stamp back')

// ── The docs steward handshake ───────────────────────────────────────────────
// docs/steward/SCHEMA.md: every fleet repo carries NOW.md at its root and a
// history log. The ingest reads NOW.md's three lens-facing sections instead of
// the README opening, merges its never_publish list into the never-reveal
// note, and treats the history log as a build-log candidate. Without this the
// steward writes the "why" for a reader who never sees it.
const { BUILD_LOG_CANDIDATES, NOW_SECTIONS, nowExcerpt, withNeverPublish } = await import('../api/_buildSignals.ts')
assert.ok((BUILD_LOG_CANDIDATES as readonly string[]).includes('docs/history/LOG.md'), 'the steward history log is a build-log candidate')
assert.deepEqual([...NOW_SECTIONS], ['What it is', 'Who it is for and why it matters for Mindmake', 'What changed recently'], 'the lens reads the three sections SCHEMA.md promises')
const sampleNow = [
  '---', 'repo: krishanraja/example', 'as_of: 2026-09-07', 'never_publish: [the client list, "the rate card"]', '---',
  '# Example: where it is right now', '', '## What it is', 'A thing.', '', '## Who it is for and why it matters for Mindmake', 'The buyer.', '',
  '## Where it is right now (as of 2026-09-07)', 'Live.', '', '## What changed recently', '- 2026-09-06 shipped the gate.', '', '## Read next', 'x', '', '## Do not trust', 'Nothing.', '',
].join('\n')
const excerpt = nowExcerpt(sampleNow)
assert.deepEqual(excerpt.never_publish, ['the client list', 'the rate card'], 'never_publish parses from the frontmatter list')
assert.match(excerpt.text, /## What it is\nA thing\./)
assert.match(excerpt.text, /## What changed recently\n- 2026-09-06 shipped the gate\./)
assert.doesNotMatch(excerpt.text, /Where it is right now|Read next|Do not trust/, 'only the three lens-facing sections travel')
assert.deepEqual(nowExcerpt('no frontmatter, no sections'), { text: '', never_publish: [] }, 'a malformed NOW.md degrades to nothing, never throws')
const merged = withNeverPublish(buildProductFor('krishanraja/mm-ctrl'), ['the rate card'])
assert.match(merged.never_reveal || '', /unreleased pricing; the rate card$/, 'never_publish extends the registry note')
assert.equal(withNeverPublish(buildProductFor('krishanraja/mm-ctrl'), []).never_reveal, buildProductFor('krishanraja/mm-ctrl').never_reveal, 'an empty list changes nothing')
assert.match(read('api/_buildSignals.ts'), /fetchDocExcerpts\(key, token, head, compare\.paths, now\)/, 'the ingest passes NOW.md into the excerpt reader')

console.log('PASS  five named products, anonymous side builds, no figures in the Money of AI, one source type in three places, cron wired, steward handshake')
