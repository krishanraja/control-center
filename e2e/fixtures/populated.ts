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

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

/** The ISO week label the engine writes, for the current week. */
export function isoWeek(at = new Date()): string {
  const d = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()))
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

const LANES = ['publication', 'builder_economy', 'mindmake'] as const
const STATES = ['drafting', 'review', 'approved', 'researching'] as const

export const IDEAS = Array.from({ length: 22 }, (_, i) => ({
  id: `idea-${i}`,
  idea: [
    'The quiet economics of running your own inference',
    'What a two-person team ships in a week with agents in CI',
    'Pricing an AI product when the marginal cost is not zero',
    'Why the demo that wins the room loses the pilot',
  ][i % 4] + ` (${i + 1})`,
  thesis: 'A working note on where the cost actually lands once the novelty wears off.',
  body: 'Longer draft body that exists so the card has something to clamp.',
  distribution: ['newsletter'],
  source_type: 'manual', source_ref: null, source_url: null, source_snippet: null,
  source_captured_at: daysAgo(i + 1),
  state: STATES[i % STATES.length],
  // The three live subchannels in rotation, plus ONE retired spelling so the
  // read side keeps proving it routes a pre-2026-09-17 row to its room through
  // the alias ledger rather than dropping it. The desk opens on the first room,
  // so if none of these lands there the whole file measures an empty page.
  lane: LANES[i % LANES.length],
  lane_slot: i === 3 ? 'built' : (['mind_the_gap', 'follow_the_money', 'under_the_hood'] as const)[i % 3],
  draft_link: null, assigned_to: null, scheduled_for: null, published_at: null, published_url: null,
  confidence: 0.6, brand_fit_score: 0.7, quality_score: 'green',
  pillar_id: null, related_idea_ids: null, parent_idea_id: null,
  meta: {}, expires_at: null,
  created_at: daysAgo(i + 1), updated_at: daysAgo(i),
}))

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

/** Proposals awaiting a ruling: four on-beat, two filed under a retired lens. */
export const DECISIONS = Array.from({ length: 6 }, (_, i) => ({
  id: `dec-${i}`, kind: 'shift_proposal', ref: `shift-${i}`,
  status: 'pending', week: WEEK,
  payload: { title: SHIFTS[i].title, why: 'Three independent sources in nine days.' },
  created_at: daysAgo(i),
}))

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
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  // ONE PostgREST handler, so nothing can shadow anything.
  await page.route('**/rest/v1/**', (r: Route) => {
    const rows = tables[tableOf(r.request().url())] ?? []
    return r.fulfill({ json: rows })
  })
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null,
    timezone: 'Australia/Sydney',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()),
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
