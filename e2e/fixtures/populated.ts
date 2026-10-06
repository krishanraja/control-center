import type { Page, Route } from '@playwright/test'

/**
 * One realistic data set, shared by the desk specs.
 *
 * Every layout measurement taken during the 2026-09-17 audit ran against
 * `{json: []}` and `{ok: true}`. A rail holding one line looks fine at any
 * width. What broke was a rail holding twelve cards, a grid holding one deal,
 * and a filter row holding sixty-six chips — none of which any test had ever
 * rendered. So: populated by default, and empty only where a spec says so.
 *
 * ── Registration order is load-bearing ──────────────────────────────────
 *
 * Playwright matches the LAST registered handler first. The `**\/rest\/v1\/**`
 * catch-all must therefore be registered FIRST, or it shadows every specific
 * table route and the page renders empty while every assertion still passes.
 * That is precisely how the rail was measured as fine while it was broken.
 * `assertFixturesLanded` exists so a spec cannot quietly repeat it.
 */

/**
 * The fixture's clock, and the page's: a fixed Wednesday, 10:00 UTC.
 *
 * Every time below is built from this instant, and `mockPopulatedContent` pins
 * the page's clock to the same instant, so node and the browser agree on what
 * "now" is and no spec reads the calendar. They used to read the real date on
 * both sides, which is not day-independent: the second follow.the.money
 * candidate expires an hour from now, and the app marks a piece "Clears out
 * Monday" only when it expires by the next purge (Monday 14:00 UTC since
 * 2026-10-06; it was the end of Monday before, which disagreed with the purge).
 * On a Monday from 23:00 UTC an hour from now was Tuesday, so the badge was
 * rightly absent and content-rooms.spec.ts failed in that hour every Monday
 * (2026-10-05 at 23:28 and 23:38 UTC, green at 00:01). The app was right; the
 * fixture was reading the clock.
 */
export const FIXTURE_NOW = new Date('2026-09-16T10:00:00Z')
const now = FIXTURE_NOW.getTime()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

/** The ISO week label the engine writes (a UTC week), for the fixture's week. */
export function isoWeek(at = FIXTURE_NOW): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const WEEK = isoWeek()

// ── the engine's run ledger ─────────────────────────────────────────────────

/**
 * All three statuses and every shape that has actually been written.
 *
 * `learning_compile` and `inspiration_scan` skip forever, which is their normal
 * state; `arcs_surface` and `investigations` genuinely failed; `aeo_ingest` has
 * no row at all, which is the silent case the ledger exists to catch.
 */
export const ENGINE_RUNS = [
  { job: 'feed_ingest', status: 'ok', reason: null, finished_at: hoursAgo(3) },
  { job: 'editorial_radar', status: 'ok', reason: null, finished_at: hoursAgo(4) },
  { job: 'triage_sweep', status: 'ok', reason: null, finished_at: hoursAgo(5) },
  { job: 'content_cluster', status: 'ok', reason: null, finished_at: hoursAgo(6) },
  { job: 'archive_stale', status: 'ok', reason: null, finished_at: hoursAgo(7) },
  { job: 'lens_radar', status: 'ok', reason: null, finished_at: daysAgo(2) },
  { job: 'creator_posts', status: 'ok', reason: null, finished_at: daysAgo(2) },
  { job: 'build_signals', status: 'ok', reason: null, finished_at: daysAgo(2) },
  { job: 'shifts_detect', status: 'ok', reason: null, finished_at: daysAgo(2) },
  { job: 'briefs_assemble', status: 'ok', reason: null, finished_at: daysAgo(1) },
  { job: 'purge', status: 'ok', reason: null, finished_at: daysAgo(1) },
  { job: 'runner_watch', status: 'ok', reason: null, finished_at: hoursAgo(1) },
  // Normal idleness, said in the engine's own words. Never an alarm.
  { job: 'learning_compile', status: 'skipped', reason: 'corpus too thin: 3 events', finished_at: daysAgo(2) },
  { job: 'inspiration_scan', status: 'skipped', reason: 'no new files in the inspiration folder', finished_at: hoursAgo(2) },
  // Two real faults, and they must stay loud.
  { job: 'arcs_surface', status: 'failed', reason: 'arc_cards write failed: null value in column "components" of relation "arc_cards" violates not-null constraint', finished_at: daysAgo(2) },
  { job: 'investigations', status: 'failed', reason: 'the job reported failure without a reason', finished_at: daysAgo(3) },
  // aeo_ingest: deliberately absent.
]

// ── content ─────────────────────────────────────────────────────────────────

const hoursAhead = (h: number) => new Date(now + h * 3_600_000).toISOString()

/** A real draft: over the 200 characters the engine counts as a draft, with
 *  the prediction section the publish check reads. `sure` is the number after
 *  "How sure we are", or the placeholder the engine leaves for Krish. */
function draft(argument: string, prediction: string, sure: string): string {
  return [
    '## THE ARGUMENT',
    argument,
    '',
    '## WHAT WE FOUND',
    'We read the public filings, the release notes and the support forums for every product named here, and kept only what two sources agreed on.',
    '',
    '## OUR PREDICTION',
    prediction,
    '',
    `How sure we are: ${sure}`,
    '',
  ].join('\n')
}

/** The ladder's verdict, in the shape the engine writes on meta.ladder. */
function judged(band: 'ready' | 'repairable' | 'weak', score: number, opts: { winner?: string; weakest?: string; angle?: string; run?: string; sources?: string[] } = {}) {
  return {
    ladder: {
      final: { band, score, weakest: opts.weakest ?? 'consequence' },
      first: { score: score - 1 },
      router: { winner: opts.winner ?? null, fits: opts.winner ? { [opts.winner]: 8 } : {} },
      expansion: opts.angle ? { angle: opts.angle } : {},
      attempts: [],
      panel_run_id: opts.run ?? null,
      judged_at: hoursAgo(5),
    },
    ...(opts.sources ? { sources: opts.sources } : {}),
  }
}

const IDEA_DEFAULTS = {
  distribution: ['newsletter'],
  source_type: 'manual', source_ref: null, source_url: null, source_snippet: null,
  lane: null, draft_link: null, assigned_to: null, scheduled_for: null, published_at: null, published_url: null,
  confidence: 0.6, brand_fit_score: 0.7, quality_score: 'green',
  pillar_id: null, related_idea_ids: null, parent_idea_id: null,
  expires_at: null as string | null, buried_at: null, library_at: null,
}

/**
 * A morning in the engine, modelled on the live tables on 2026-10-04: one
 * finished piece with no date, one draft whose facts passed and waits for
 * approval, one draft that has never been fact checked and still needs its
 * "How sure we are" number, a series with nothing picked for its next day and
 * five judged-ready pieces to pick from (one of them clearing out on Monday),
 * and the piles the engine handles on its own: pieces it is still improving,
 * weak ones and new finds. One row still carries the retired `built` slot, so
 * the read side keeps proving it reaches under.the.hood through the alias.
 */
export const IDEAS = [
  {
    ...IDEA_DEFAULTS, id: 'idea-uth-approved', state: 'approved', lane_slot: 'under_the_hood',
    idea: 'Why our agent got slower when we gave it more tools',
    thesis: 'Every tool we added made the agent spend longer choosing, and past nine tools it chose worse. Fewer, sharper tools beat a big toolbox.',
    body: draft('Every tool we added made the agent spend longer choosing.', 'By 31 March 2027, the two biggest agent frameworks will cap the tools an agent sees at once by default.', '65%'),
    meta: { ...judged('ready', 8, { winner: 'under_the_hood', run: 'run-uth-1' }), fact_check: { passed: true, blocking: 0, ran_at: hoursAgo(20) } },
    created_at: daysAgo(9), updated_at: hoursAgo(20),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-mtg-review', state: 'review', lane_slot: 'mind_the_gap',
    idea: 'Same agent, opposite answers',
    thesis: 'We asked the same support agent the same refund question 40 times and got two opposite decisions. The cause was not the model but a search step that fetched a different policy page depending on which server answered first.',
    body: draft('We asked the same support agent the same refund question 40 times and got two opposite decisions.', 'By 30 June 2027, at least one big agent platform will publish a consistency score next to its accuracy score.', '70%'),
    meta: { ...judged('ready', 8, { winner: 'mind_the_gap', run: 'run-mtg-1' }), fact_check: { passed: true, blocking: 0, ran_at: hoursAgo(6) } },
    created_at: daysAgo(6), updated_at: hoursAgo(6),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-uth-drafting', state: 'drafting', lane_slot: 'under_the_hood',
    idea: 'The cache that cut our model bill by a third',
    thesis: 'Most of what our agents asked the model had been asked before that week. A plain cache in front of it cut the bill by a third and made answers steadier.',
    body: draft('Most of what our agents asked the model had been asked before that week.', 'By 31 December 2026, every major model provider will charge less for a repeated question than a new one.', '[Krish to set]'),
    meta: judged('ready', 7, { winner: 'under_the_hood', run: 'run-uth-2' }),
    created_at: daysAgo(4), updated_at: hoursAgo(9),
  },
  // follow.the.money has nothing picked for its next day: these are the five
  // judged ready for it, best first by the panel's standing.
  {
    ...IDEA_DEFAULTS, id: 'idea-ftm-ready-1', state: 'researching', lane_slot: 'follow_the_money',
    idea: 'Who really pays for the free AI tier',
    thesis: 'Free AI plans are paid for by the heaviest business users. Their bills rose by about a third this year while the free tier grew.',
    body: null,
    meta: judged('ready', 8, { winner: 'follow_the_money', run: 'run-ftm-1', sources: ['https://www.ft.com/content/ai-pricing', 'https://openai.com/api/pricing'] }),
    created_at: daysAgo(3), updated_at: hoursAgo(5),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-ftm-ready-2', state: 'researching', lane_slot: 'follow_the_money',
    idea: 'Software stopped charging per person. Now it charges per task',
    thesis: 'Three of the biggest business software makers moved from a price per seat to a price per finished task this year, and buyers now pay for the work the agent does rather than for the people who log in.',
    body: null,
    meta: judged('ready', 7, { winner: 'follow_the_money', run: 'run-ftm-2', sources: ['https://www.salesforce.com/news/pricing', 'https://www.zendesk.com/pricing'] }),
    expires_at: hoursAhead(1),
    created_at: daysAgo(5), updated_at: hoursAgo(5),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-ftm-ready-3', state: 'seeded', lane_slot: 'follow_the_money',
    idea: 'Why AI start-ups give the model away and charge for the dull part',
    thesis: 'The start-ups growing fastest give the model away and charge for the boring work around it: the billing, the audit trail, the hand-off to a person.',
    body: null,
    meta: judged('ready', 7, { winner: 'follow_the_money', run: 'run-ftm-3', weakest: 'buyer', sources: ['https://a16z.com/ai-pricing'] }),
    created_at: daysAgo(6), updated_at: hoursAgo(5),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-ftm-ready-4', state: 'seeded', lane_slot: 'follow_the_money',
    idea: 'The card networks are rewriting who pays when an agent buys',
    thesis: 'Visa and Mastercard are changing their dispute rules for purchases an AI agent makes for someone, and the cost of a wrong purchase lands on the shop.',
    body: null,
    meta: judged('ready', 7, { winner: 'follow_the_money', run: 'run-ftm-4' }),
    created_at: daysAgo(8), updated_at: hoursAgo(5),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-ftm-ready-5', state: 'seeded', lane_slot: 'follow_the_money',
    idea: 'What a seat licence is worth when the seat is an agent',
    thesis: 'Companies are paying full seat prices for agents that log in once a day. Procurement teams have started to notice.',
    body: null,
    meta: judged('ready', 7, { winner: 'follow_the_money', run: 'run-ftm-5' }),
    created_at: daysAgo(10), updated_at: hoursAgo(5),
  },
  {
    ...IDEA_DEFAULTS, id: 'idea-mtg-ready-1', state: 'seeded', lane_slot: 'mind_the_gap',
    idea: 'Three bills, one pattern: states copying the same AI law',
    thesis: 'Three state bills filed in September copy the same industry template word for word, so the fight over AI rules is quietly becoming one fight.',
    body: null,
    meta: judged('ready', 7, { winner: 'mind_the_gap', run: 'run-mtg-2' }),
    created_at: daysAgo(2), updated_at: hoursAgo(5),
  },
  // What the engine keeps improving on its own, what it judged too weak, and
  // what it found but has not judged yet. None of these is a call.
  ...Array.from({ length: 6 }, (_, k) => ({
    ...IDEA_DEFAULTS, id: `idea-repairable-${k}`, state: 'seeded',
    lane_slot: k === 0 ? 'built' : (['mind_the_gap', 'follow_the_money', 'under_the_hood'] as const)[k % 3],
    idea: [
      'A pricing page that answers the question before the buyer asks it',
      'The demo that wins the room loses the pilot',
      'What a two-person team ships in a week with agents in CI',
      'Running your own inference costs more than the invoice says',
      'Why the second agent you hire is harder than the first',
      'The support queue that answers itself at night',
    ][k],
    thesis: 'A working note the engine is still sharpening.',
    body: null,
    meta: judged('repairable', 6, { winner: (['mind_the_gap', 'follow_the_money', 'under_the_hood'] as const)[k % 3] }),
    created_at: daysAgo(k + 2), updated_at: hoursAgo(5),
  })),
  ...Array.from({ length: 3 }, (_, k) => ({
    ...IDEA_DEFAULTS, id: `idea-weak-${k}`, state: 'seeded', lane_slot: 'mind_the_gap',
    idea: ['Ten AI tools to try this weekend', 'AI is changing everything', 'A quick take on the latest model launch'][k],
    thesis: 'A thin headline the panel could not lift.',
    body: null,
    meta: judged('weak', 3, { weakest: 'novelty' }),
    created_at: daysAgo(k + 1), updated_at: hoursAgo(5),
  })),
  ...Array.from({ length: 4 }, (_, k) => ({
    ...IDEA_DEFAULTS, id: `idea-found-${k}`, state: 'seeded', lane_slot: null,
    idea: [
      'Insurers start asking which decisions an AI made',
      'The hidden cost of retraining a fine-tuned model',
      'Why procurement now asks for a model card',
      'Agents that book travel are failing on refunds',
    ][k],
    thesis: 'Found this morning. Waiting for the judges.',
    body: null,
    meta: {},
    created_at: hoursAgo(k * 7 + 2), updated_at: hoursAgo(k * 7 + 2),
  })),
]

export const SHIFTS = Array.from({ length: 8 }, (_, i) => ({
  id: `shift-${i}`, slug: `shift-${i}`,
  title: [
    'Agent teams are moving into CI pipelines',
    'Inference is becoming a line item buyers argue about',
    'Small teams are shipping at the cadence of big ones',
    'Buyers now ask who owns the model output',
  ][i % 4] + ` (${i + 1})`,
  summary: 'x', implication: 'x',
  category: 'tools',
  // Six live lenses; two deliberately off-beat so the discard line renders.
  lens: i < 6 ? ['build_practice', 'category_positioning', 'buyer_behaviour', 'cost_structure', 'distribution', 'talent'][i] : null,
  // Same rotation, same reason: one retired spelling, the rest live, and some
  // with no lane at all so the cross-cutting section still has something in it.
  status: 'active',
  lane: i === 1 ? 'built' : (i % 2 ? (['mind_the_gap', 'follow_the_money', 'under_the_hood'] as const)[i % 3] : null),
  first_seen_on: '2026-07-01', last_evidence_on: '2026-09-10',
  momentum: 8 - i, momentum_history: [{ week: WEEK, momentum: 8 - i }],
  day_span_total: 9, source_count_total: 5, story_count: 12,
  provenance: 'lived', decision: null, superseded_by: null,
}))

/** The week's open rulings: one new pattern, one piece asking to be kept for
 *  good, and the notice of Monday's clear-out. */
export const DECISIONS = [
  {
    id: 'dec-shift', kind: 'shift_proposal', ref: 'shift-1', status: 'pending', week: WEEK,
    payload: { title: 'Inference is becoming a line item buyers argue about', stories: 7, day_span: 9, sources: 5, summary: 'Finance teams now ask for the cost per answer before they renew.' },
    created_at: daysAgo(1),
  },
  {
    id: 'dec-keep', kind: 'graduation', ref: 'idea-uth-approved', status: 'pending', week: WEEK,
    payload: { title: 'How we priced our first agent' },
    created_at: daysAgo(2),
  },
  {
    id: 'dec-purge', kind: 'purge_preview', ref: WEEK, status: 'pending', week: WEEK,
    payload: { expiring: 14 },
    created_at: daysAgo(1),
  },
]

export const BRIEF = {
  id: 'brief-1', week: WEEK, status: 'ready',
  title: 'The week the cost conversation moved to the buyer',
  sections: { stance: 'Take the position' },
  created_at: daysAgo(1), updated_at: daysAgo(1),
}

export const ARC_CARDS = Array.from({ length: 7 }, (_, i) => ({
  id: `card-${i}`, shift_id: `shift-${i}`, week: WEEK,
  headline: SHIFTS[i].title,
  what_changed: 'Three buyers asked the same question in one week.',
  why_now: 'The pricing page stopped answering it.',
  the_opening: 'Say the number out loud before they ask.',
  where_this_goes: 'A short essay and one chart.',
  reader_decision: 'Whether to publish the number.',
  format: 'essay', score: 0.9 - i * 0.05, components: [],
  blocked: i > 4, blocks: i > 4 ? ['too few independent beats'] : [],
  surfaced: i <= 4, reserved_slot: i === 4,
  surface_reason: i > 4 ? 'too few independent beats' : 'building arc with a folder question',
}))

// ── the wiring ──────────────────────────────────────────────────────────────

/** Which Supabase table a PostgREST URL is asking for. */
function tableOf(url: string): string {
  const m = /\/rest\/v1\/([^?/]+)/.exec(url)
  return m ? m[1] : ''
}

/**
 * Every table this fixture answers, and the rows it answers with.
 *
 * One handler over one map, rather than one `page.route` per table: the
 * per-table form is what made ordering a trap, since a later generic
 * registration silently won and the page rendered empty.
 */
export function contentTables(): Record<string, unknown[]> {
  return {
    content_ideas: IDEAS,
    shifts: SHIFTS,
    content_decisions: DECISIONS,
    weekly_briefs: [BRIEF],
    arc_cards: ARC_CARDS,
    content_engine_runs: ENGINE_RUNS,
  }
}

export async function mockPopulatedContent(page: Page, tables = contentTables()) {
  // The page reads the instant the rows were built from. Every caller mocks
  // before page.goto, which is when the pin has to land.
  await page.clock.setFixedTime(FIXTURE_NOW)
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  // ONE PostgREST handler, so nothing can shadow anything.
  await page.route('**/rest/v1/**', (r: Route) => {
    const rows = tables[tableOf(r.request().url())] ?? []
    return r.fulfill({ json: rows })
  })
  // The Studio's actionable queue, as a well-formed empty list. A bare
  // `{ ok: true }` fails the envelope check and reads as "could not be checked".
  await page.route('**/api/video-studio/reviews?*', (r: Route) => r.fulfill({ json: {
    ok: true, schema_version: 1, reviews: [], server_time: new Date(now).toISOString(),
  } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null,
    timezone: 'Australia/Sydney',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(FIXTURE_NOW),
  } }))
}

/**
 * Prove the fixtures reached the page before measuring anything on it.
 *
 * A layout claim made over an empty page is worth nothing, and an empty page
 * is the default failure mode of every mock in this suite. Call this at the
 * top of any spec that then measures.
 */
export async function assertFixturesLanded(page: Page, expectText: string) {
  const { expect } = await import('@playwright/test')
  await expect(page.getByText(expectText, { exact: false }).first())
    .toBeVisible({ timeout: 15_000 })
}
