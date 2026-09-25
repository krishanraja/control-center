import type { Page, Route } from '@playwright/test'
import { contentTables } from './populated'

/**
 * One populated data set for the whole-app layout audit.
 *
 * The desk fixtures cover Content, Network and Advisory. This one covers the
 * rest — Visibility (guests + stages), Customers, the OS subtabs — because a
 * layout claim made against `{json: []}` is worth nothing, and an empty page is
 * the default failure mode of every mock in this suite. Every surface the audit
 * measures has to be rendered with enough rows that the lanes overflow the way
 * they do on a live account: the Visibility board screenshot Krish sent had 106
 * guests and 70 events in it.
 */

const now = Date.now()
const iso = (msFromNow: number) => new Date(now + msFromNow).toISOString()
const daysOut = (d: number) => iso(d * 86_400_000)
const daysAgo = (d: number) => iso(-d * 86_400_000)

// ── Visibility: inbound guests ──────────────────────────────────────────────

const GUEST_NAMES = [
  'Dan Pratl', 'Justin Kramm', 'Melissa Rosenthal', 'Joe Reid', 'Ankur Mathur',
  'Neesha Malik', 'Jason M. Lemkin', 'Tripti Vishwakarma', 'Kunwar Singh',
  'Robin Jose', 'Joshua Benton', 'Priya Raghunathan', 'Tom Fletcher',
  'Aisha Bello', 'Marco Venturi', 'Hannah Okonkwo', 'Diego Salas',
  'Yuki Tanaka', 'Freya Lindqvist', 'Samuel Adeyemi',
]

const GUEST_STATUSES = [
  'scouted', 'scouted', 'scouted', 'enriched', 'enriched', 'enriched',
  'pitched', 'pitched', 'responded', 'scheduled', 'confirmed', 'dropped',
] as const

export const GUESTS = GUEST_NAMES.flatMap((name, i) =>
  [0, 1].map(k => {
    const n = i * 2 + k
    return {
      id: `guest-${n}`,
      name: k === 0 ? name : `${name} (${k})`,
      // NOT example.com: recordHygiene treats @example.com as a throwaway
      // test domain and drops the row, so a fixture using it measures an
      // empty board while looking populated.
      email: `${name.toLowerCase().replace(/[^a-z]/g, '.')}@mailbox.dev`,
      linkedin_url: `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z]/g, '-')}`,
      twitter_handle: null,
      personal_url: null,
      podcast_target: 'either',
      one_liner:
        'The verification gap: why the easier it gets to produce content and advice, the more the market will pay for provable track record, and what infrastructure actually needs to exist to make that work.',
      why_fit:
        'Spent years inside the SEC watching credibility get gamed at scale, and now builds the pipes that let judgment and track record travel in an AI world where anyone can generate a convincing surface.',
      best_channel: 'linkedin',
      pitch_draft: null,
      fit_score: 100 - n,
      attainability_score: 60 - (n % 40),
      quality_score: n % 3 === 0 ? 'green' : n % 3 === 1 ? 'amber' : 'red',
      status: GUEST_STATUSES[n % GUEST_STATUSES.length],
      triage_score: 100 - n,
      triage_reason: 'Scouted by the judgment-economy lens scout.',
      briefing_status: 'none',
      briefing_doc_url: null,
      briefing_requested_at: null,
      briefing_generated_at: null,
      scheduled_at: n % 7 === 0 ? daysOut(3 + (n % 10)) : null,
      source: 'nell',
      source_url: null,
      origin: 'agent',
      buried_at: null,
      buried_reason: null,
      protected_at: null,
      relevance_index: n % 3,
      created_at: daysAgo(n % 30),
      updated_at: daysAgo(n % 5),
    }
  }),
)

// ── Visibility: outbound stages, CFPs and press ─────────────────────────────

const EVENT_TITLES = [
  'Section AI Strategy Summit (Virtual)', 'SaaStr Annual', 'Web Summit Lisbon',
  'The Information Subscriber Summit', 'AI Engineer World’s Fair',
  'Lenny’s Podcast', 'The Generalist', 'Every — Chain of Thought',
  'MAU Vegas', 'Product-Led Summit London', 'Sifted Summit',
  'a16z Runtime', 'The Neuron', 'Exponential View',
]

const VIS_STATUSES = ['sourced', 'queued', 'queued', 'queued', 'applied', 'accepted', 'rejected', 'done', 'dropped'] as const
const VIS_TYPES = ['cfp', 'conference', 'podcast', 'newsletter', 'guest_appearance', 'other'] as const

export const VISIBILITY_TARGETS = EVENT_TITLES.flatMap((title, i) =>
  [0, 1, 2, 3, 4].map(k => {
    const n = i * 5 + k
    return {
      id: `vis-${n}`,
      title: k === 0 ? title : `${title} ${2026 + k}`,
      type: VIS_TYPES[n % VIS_TYPES.length],
      event_url: 'https://example.com/event',
      cfp_url: 'https://example.com/cfp',
      deadline_at: n % 4 === 0 ? daysAgo(100 - n) : daysOut(3 + (n % 60)),
      event_start_at: daysOut(30 + (n % 120)),
      audience:
        'Senior enterprise decision-makers building or governing AI adoption roadmaps. They are buying AI products, not building them. They need frameworks, not architecture. Typically lack deep technical backgrounds and are accountable to boards for AI ROI.',
      audience_size: 400 + n * 25,
      why_relevant:
        'This is the exact buyer for the advisory offer, in the room, at the moment they are writing next year’s AI budget.',
      suggested_talk_title: 'The judgment economy: what stays scarce when everything else gets cheap',
      relevance_score: 95 - n,
      quality_score: n % 3 === 0 ? 'green' : n % 3 === 1 ? 'amber' : 'red',
      recommended_next_step: 'Submit the CFP with the judgment-economy talk.',
      status: VIS_STATUSES[n % VIS_STATUSES.length],
      format: 'virtual',
      location: 'Remote',
      ticket_price_usd: null,
      source: 'nova',
      source_url: null,
      origin: 'agent',
      buried_at: null,
      buried_reason: null,
      protected_at: null,
      relevance_index: n % 3,
      created_at: daysAgo(n % 30),
      updated_at: daysAgo(n % 5),
      organizer: 'Section',
      organizer_reputation: 'Well regarded with this buyer.',
      audience_sector: 'Enterprise',
      audience_seniority: 'Director and above',
      past_speakers: [{ name: 'A. Speaker', role: 'CPO' }],
      cfp_requirements: { needs_bio: true, needs_headshot: true },
    }
  }),
)


// ── The /api surfaces ───────────────────────────────────────────────────────
//
// Home, Intel and Focus read almost nothing from PostgREST: their content
// arrives over /api, which a blanket `{ ok: true }` mock answers with a
// well-formed nothing. The first audit run therefore measured all three as
// empty states and reported holes of 0.33-0.38 that said more about the
// fixture than the layout. These are the real envelopes.

const WEEK_ENDING = new Date(now + 3 * 86_400_000).toISOString().slice(0, 10)

function mondayOf(offsetWeeks = 0): string {
  const d = new Date(now + offsetWeeks * 7 * 86_400_000)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

const goal = (id: string, title: string, horizon: 'os' | 'weekly', extra: Record<string, unknown> = {}) => ({
  id, title, horizon,
  parent_id: horizon === 'weekly' ? 'os-1' : null,
  venture: 'mindmake',
  job: 'sell',
  status: 'active',
  priority: 1,
  is_stale: false,
  orphaned: false,
  days_since_touch: 1,
  stale_after_days: 14,
  week_start: horizon === 'weekly' ? mondayOf() : null,
  closed_at: null,
  carried_from: null,
  updated_at: daysAgo(1),
  created_at: daysAgo(30),
  ...extra,
})

export const GOAL_LADDER = {
  ok: true,
  by_horizon: {
    os: [
      goal('os-1', 'Twenty-five paid advisory rooms by the end of the quarter', 'os'),
      goal('os-2', 'One piece a week that a buyer forwards to their board', 'os'),
      goal('os-3', 'The OS runs a full week without Krish touching a workflow', 'os'),
    ],
    weekly: [
      goal('wk-1', 'Send fifteen approaches to the judgment-economy list', 'weekly'),
      goal('wk-2', 'Publish the verification-gap essay and pitch it to three newsletters', 'weekly'),
      goal('wk-3', 'Close the Sifted CFP with the judgment-economy talk', 'weekly', { status: 'done', closed_at: daysAgo(1) }),
    ],
  },
  ventures: ['mindmake', 'ctrl'],
  stale_count: 0,
  orphan_count: 0,
  week_of: mondayOf(),
  current_week: mondayOf(),
}

export const SCORECARD = {
  ok: true,
  week_ending: WEEK_ENDING,
  current: {
    week_ending: WEEK_ENDING,
    approaches_sent: 11, calls_taken: 3, paid_pilots: 1,
    cash_invoiced_gbp: 4500, pieces_published: 2, unasked_hours: 6,
    unasked_measured: true, commits: 14,
  },
  weeks: Array.from({ length: 12 }, (_, i) => ({
    week_ending: new Date(now - i * 7 * 86_400_000).toISOString().slice(0, 10),
    frozen_at: i > 0 ? daysAgo(i * 7) : null,
    plan_sent: 15,
    variance_note: i === 3 ? 'Two days lost to the Supabase migration.' : null,
    approaches_sent: 15 - (i % 5), calls_taken: 4 - (i % 3), paid_pilots: i % 4 === 0 ? 1 : 0,
    cash_invoiced_gbp: i % 4 === 0 ? 4500 : 0, pieces_published: 2 - (i % 2), unasked_hours: 5 + (i % 4),
    unasked_measured: true,
    override_approaches_sent: null, override_calls_taken: null, override_paid_pilots: null,
    override_cash_invoiced_gbp: null, override_pieces_published: null, override_unasked_hours: null,
  })),
  targets: { approaches_sent: 25, calls_taken: 12, paid_pilots: 25, cash_invoiced_gbp: 60000, pieces_published: 12, unasked_hours: 0 },
  totals:  { approaches_sent: 148, calls_taken: 31, paid_pilots: 4, cash_invoiced_gbp: 18000, pieces_published: 19, unasked_hours: 62 },
  gap:     { approaches_sent: -102, calls_taken: -81, paid_pilots: -21, cash_invoiced_gbp: -42000, pieces_published: 7, unasked_hours: 62 },
  stop_rule: { on: 'Two weeks under ten approaches', reads: 'Stop building. Sell.' },
  day_90: new Date(now + 40 * 86_400_000).toISOString().slice(0, 10),
  unasked_measured: true,
}

export const SHIPS = {
  ok: true,
  this_week: 3,
  days_since_last: 1,
  return_rate: 2,
  last_ten: Array.from({ length: 6 }, (_, i) => ({
    id: `ship-${i}`,
    created_at: daysAgo(i + 1),
    occurred_at: daysAgo(i + 1),
    source: 'manual',
    channel: 'linkedin',
    description: [
      'Published the verification-gap essay',
      'Sent the Sifted CFP',
      'Shipped the triage cockpit',
      'Recorded with Dan Pratl',
      'Invoiced the first advisory room',
      'Wired the judgment-economy scout',
    ][i],
    external_ref: null,
    dedup_key: null,
  })),
}

export const BETS = {
  ok: true,
  bets: Array.from({ length: 5 }, (_, i) => ({
    id: `bet-${i}`,
    title: ['Judgment economy is the wedge', 'Advisory beats courses', 'Video is the top of funnel',
            'CTRL sells itself once one client ships', 'Newsletters outperform stages'][i],
    status: i === 0 ? 'live' : i === 4 ? 'retired' : 'live',
    venture: 'mindmake',
    evidence: 'Three buyers used the phrase unprompted on calls this month.',
    created_at: daysAgo(20 - i),
    updated_at: daysAgo(i),
  })),
}

export const ASKS = {
  ok: true,
  asks: Array.from({ length: 3 }, (_, i) => ({
    id: `ask-${i}`,
    ask_line: ['Would a three week pilot be useful to you?',
               'Can I send you the verification-gap piece?',
               'Who else should see this?'][i],
    kind: 'pilot',
    resolved_at: null,
    created_at: daysAgo(i),
  })),
}

// ── Customers, contacts, the OS tables ──────────────────────────────────────

export const CUSTOMERS = Array.from({ length: 34 }, (_, i) => ({
  id: `cust-${i}`,
  name: `Northwind ${i + 1} Group`,
  venture: i % 2 === 0 ? 'mindmake' : 'ctrl',
  status: ['active', 'active', 'at_risk', 'churned'][i % 4],
  mrr_gbp: 1500 + i * 250,
  health: ['green', 'amber', 'red'][i % 3],
  owner: 'Krish',
  renewal_at: daysOut(20 + i * 10),
  last_touch_at: daysAgo(i + 1),
  notes: 'Renewal conversation opens next month; the sponsor moved teams in August.',
  created_at: daysAgo(200 - i),
  updated_at: daysAgo(i),
}))

export const AGENTS = Array.from({ length: 28 }, (_, i) => ({
  id: `agent-${i}`,
  name: ['Nova', 'Nell', 'Marcus', 'Maya', 'Zara', 'Cleo', 'Agatha', 'Hunter', 'Iris', 'Otto', 'Vera', 'Rex', 'Juno', 'Sol'][i % 14] + (i >= 14 ? ' II' : ''),
  role: 'Scout and enrich the lane it owns, then hand Krish a decision.',
  status: i % 5 === 0 ? 'degraded' : 'healthy',
  pod: ['growth', 'content', 'ops'][i % 3],
  last_run_at: daysAgo(i % 3),
  created_at: daysAgo(300),
  updated_at: daysAgo(i % 3),
}))

export const TASKS = Array.from({ length: 40 }, (_, i) => ({
  id: `task-${i}`,
  title: `Decide whether to run the ${['Sifted', 'SaaStr', 'Lenny', 'Every'][i % 4]} play this week`,
  status: i % 3 === 0 ? 'waiting' : 'open',
  kind: 'ruling',
  venture: 'mindmake',
  agent: 'Nova',
  body: 'The lane has enough evidence to move. What is missing is a ruling on which of the two angles leads.',
  created_at: daysAgo(i),
  updated_at: daysAgo(i),
}))

export const SYSTEM_HEALTH = Array.from({ length: 26 }, (_, i) => ({
  id: `health-${i}`,
  component: ['ingest', 'enrichment', 'outreach', 'briefs', 'video', 'search', 'billing', 'realtime'][i % 8] + (i >= 8 ? `-${Math.floor(i / 8)}` : ''),
  status: i % 4 === 0 ? 'degraded' : 'ok',
  detail: 'Last run finished inside its window.',
  checked_at: daysAgo(0),
}))

export const WORKFLOW_RUNS = Array.from({ length: 48 }, (_, i) => ({
  id: `run-${i}`,
  workflow: `flow_${i}`,
  name: `Flow ${i + 1}`,
  status: i % 5 === 0 ? 'error' : 'success',
  started_at: daysAgo(i % 3),
  finished_at: daysAgo(i % 3),
  error: null,
}))

export const CONTACTS = Array.from({ length: 60 }, (_, i) => ({
  id: `contact-${i}`,
  full_name: `Contact Person ${i + 1}`,
  first_name: 'Contact',
  company: `Company ${i + 1}`,
  title: 'Chief Product Officer',
  email: `contact${i}@mailbox.dev`,
  linkedin_url: `https://www.linkedin.com/in/contact-${i}`,
  country: ['GB', 'AU', 'US'][i % 3],
  tier: (i % 3) + 1,
  venture: 'mindmake',
  created_at: daysAgo(i),
  updated_at: daysAgo(i),
}))

/** Every table the audited surfaces read, with rows in it. */
// ── The attend lane: rooms worth being in ───────────────────────────────────
//
// Populated deliberately across BOTH cities and all four actionability bands, so
// the no-scroll gates measure a full board rather than an empty one. `{ ok: true }`
// is a well-formed nothing, and a fixture that renders an empty page measures
// nothing: Home, Intel and Focus were once scored as holes of 0.33-0.38 that said
// more about the mock than the layout.
//
// The mix is the real one from 2026-09-24 on purpose, developer meetups included,
// so a screenshot shows what the ranking does with them rather than only what it
// does with the rooms it likes.
const EVENT_ROOMS: Array<[string, string, string, number, number, number]> = [
  // title, city, host_kind, peers, buyers, days out
  ['Entrepreneurs Organization New York · members dinner', 'new_york', 'operator', 88, 42, 9],
  ['Founders Forum London', 'london', 'operator', 84, 55, 16],
  ['Owner-manager roundtable, Mayfair', 'london', 'operator', 79, 38, 5],
  ['On Deck founder cohort social', 'new_york', 'community', 71, 30, 24],
  ['Sifted Summit', 'london', 'media', 62, 58, 40],
  ['Retail Media Leadership Summit', 'london', 'media', 30, 74, 20],
  ['Marketing Leadership Summit · PepsiCo, Mondelez, Samsung', 'new_york', 'vendor', 22, 68, 11],
  ['Scaleup CFO breakfast', 'new_york', 'operator', 66, 49, 3],
  ['The London Network Event, Startup Founders, Tech Entrepreneurs, Investors', 'london', 'community', 41, 33, 6],
  ['London PyTorch #28', 'london', 'community', 0, 4, 7],
  ['LLMday: In-Person Event on LLMs, AI & ML', 'new_york', 'community', 0, 8, 35],
  ['AWS AI In Practice #7', 'london', 'vendor', 0, 15, 27],
  ['The Harness Engineering & Model Wrangling Hackathon', 'new_york', 'community', 0, 2, 2],
  ['Agentic AI Workshop: Getting Started with Claude Code', 'new_york', 'community', 0, 6, 6],
]

export const EVENTS = EVENT_ROOMS.map(([title, city, host_kind, peers, buyers, out], i) => ({
  id: `evt-${i}`,
  title,
  host: host_kind === 'operator' ? 'A members organisation' : 'Open to all',
  host_kind,
  url: 'https://example.com/event',
  description: 'Who is in the room decides whether this is worth an evening.',
  starts_at: daysOut(out),
  ends_at: null,
  city,
  venue: city === 'london' ? 'Central London' : 'Manhattan',
  // Always true in the fixture because events_recommendable filters on it, so a
  // false row would simply be absent and would test nothing about the layout.
  // The guard covers the rule itself.
  date_verified: true,
  date_source_url: 'https://example.com/event',
  item_kind: 'durable',
  expires_at: null,
  archived_at: null,
  archive_reason: null,
  cost_kind: i % 3 === 0 ? 'paid' : i % 3 === 1 ? 'free' : 'unknown',
  ticket_price_usd: i % 3 === 0 ? 250 + i * 25 : null,
  can_attend: true,
  can_speak: i % 5 === 0,
  speak_deadline_at: i % 5 === 0 ? daysOut(Math.max(1, out - 10)) : null,
  draw_score: peers,
  demand_score: buyers,
  score_reason: peers >= 60
    ? 'Owner-managers with real revenue, and the bar to be in the room is the revenue itself.'
    : peers === 0
      ? 'Almost entirely engineers and ML practitioners. Nobody here decides a budget.'
      : 'Mixed room. Some P&L owners, a lot of people selling to them.',
  goal_ids: [],
  // A couple of rows carry named people, because that is what turns an away city
  // into "away, named attendee" and it was empty on every live row.
  named_attendees: i === 1
    ? ['Ada Okonjo, CEO at Harbourline', 'Tom Reece, Founder at Stellwood']
    : i === 4 ? ['Priya Raman, MD at Northgate'] : null,
  scored_at: i === 13 ? null : daysAgo(1),
  source: i % 2 === 0 ? 'luma' : 'meetup',
  source_ref: `https://example.com/event/${i}`,
  decision: i === 2 ? 'attend' : null,
  decided_at: i === 2 ? daysAgo(1) : null,
  outcome: null,
  outcome_note: null,
  outcome_at: null,
  created_at: daysAgo(2),
  updated_at: daysAgo(1),
  peer_density: peers,
  buyer_density: buyers,
  practitioner_density: peers === 0 ? 92 : 10,
  vendor_density: host_kind === 'vendor' ? 70 : 12,
  seniority: peers >= 60 ? 82 : 45,
  seniority_note: null,
  score_version: 1,
  // One unscored row on purpose: the card says "not judged yet" rather than
  // showing a zero as a verdict, and that branch needs to render somewhere.
  scored_source: i === 13 ? null : 'cron',
}))

export function auditTables(): Record<string, unknown[]> {
  return {
    ...contentTables(),
    guests: GUESTS,
    visibility_targets: VISIBILITY_TARGETS,
    events: EVENTS,
    events_recommendable: EVENTS,
    event_hosts: [],
    customers: CUSTOMERS,
    customer_contacts: CONTACTS.slice(0, 6).map((c, i) => ({
      id: `contact-log-${i}`,
      customer_id: `cust-${i}`,
      // One row with no timestamp on purpose: that is the shape that took the
      // whole Subscriptions tab down, and a fixture that never produces it
      // cannot catch the regression.
      contacted_at: i === 5 ? null : daysAgo(i),
      channel: 'email',
      reason: 'check_in',
      summary: 'Quarterly check-in; the sponsor is still the same person.',
      agent: 'Maya',
      next_step: null,
      created_at: daysAgo(i),
    })),
    contacts: CONTACTS,
    leads: [],
    agents: AGENTS,
    agent_plans: [],
    tasks: TASKS,
    system_health: SYSTEM_HEALTH,
    system_config: [],
    workflow_runs: WORKFLOW_RUNS,
    workflow_proposals: [],
    workflow_health: [],
    skill_proposals: [],
    skill_deliveries: [],
    corrections: [],
    pending_flags: [],
    silent_failures: [],
    decisions_waiting: [],
    daily_focus: [],
    home_intelligence: [],
    venture_registry: [],
    audit_log: [],
    bets: [],
    zara_signals: [],
    marcus_synthesis: [],
    product_metrics: [],
    maya_striking_distance: [],
  }
}

function tableOf(url: string): string {
  const m = url.match(/\/rest\/v1\/([a-z_]+)/)
  return m ? m[1] : ''
}

/**
 * Mock everything the app reads, populated. Registration order is load-bearing:
 * Playwright matches the LAST registered handler first, so the PostgREST
 * catch-all goes on first and the specific API routes after it.
 */
export async function mockAudit(page: Page, tables = auditTables()) {
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: tables[tableOf(r.request().url())] ?? [] }))
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/network/geo', (r: Route) =>
    r.fulfill({ json: { countries: [
      { code: 'GB', name: 'United Kingdom', n: 1840, featured: true },
      { code: 'AU', name: 'Australia', n: 1120, featured: true },
      { code: 'US', name: 'United States', n: 980, featured: true },
    ] } }))
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: GOAL_LADDER }))
  await page.route('**/api/objectives*', (r: Route) => r.fulfill({ json: GOAL_LADDER }))
  await page.route('**/api/scorecard*', (r: Route) => r.fulfill({ json: SCORECARD }))
  await page.route('**/api/pilot/ships*', (r: Route) => r.fulfill({ json: SHIPS }))
  await page.route('**/api/pilot/asks*', (r: Route) => r.fulfill({ json: ASKS }))
  await page.route('**/api/bets*', (r: Route) => r.fulfill({ json: BETS }))
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'Australia/Sydney' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null,
    timezone: 'Australia/Sydney',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()),
  } }))
}

/** Every desktop surface the audit walks, by hash route. */
export const AUDIT_ROUTES: Array<{ id: string; hash: string; name: string }> = [
  { id: 'home', hash: '#/home', name: 'Home' },
  { id: 'people-network', hash: '#/people?lane=network', name: 'People · Network' },
  { id: 'people-hunt', hash: '#/people?lane=bridges', name: 'People · Hunt' },
  { id: 'people-visibility-guests', hash: '#/people?lane=visibility', name: 'People · Visibility (Guests)' },
  { id: 'people-visibility-events', hash: '#/people?lane=visibility&target=vis-3', name: 'People · Visibility (detail)' },
  { id: 'os-systems-2', hash: '#/os?sub=systems', name: 'OS · Systems (again)' },
  { id: 'people-advisory', hash: '#/people?lane=pilots', name: 'People · Advisory' },
  { id: 'customers', hash: '#/customers', name: 'Customers' },
  { id: 'growth', hash: '#/growth', name: 'Growth' },
  { id: 'content', hash: '#/content', name: 'Content' },
  { id: 'os-queue', hash: '#/os?sub=queue', name: 'OS · Queue' },
  { id: 'os-org', hash: '#/os?sub=org', name: 'OS · Org' },
  { id: 'os-intel', hash: '#/os?sub=intel', name: 'OS · Intel' },
  { id: 'os-flows', hash: '#/os?sub=flows', name: 'OS · Flows' },
  { id: 'os-systems', hash: '#/os?sub=systems', name: 'OS · Systems' },
  { id: 'focus', hash: '#/focus', name: 'Focus & Purpose' },
]
