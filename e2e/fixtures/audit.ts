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

// ── Customers, contacts, the OS tables ──────────────────────────────────────

export const CUSTOMERS = Array.from({ length: 9 }, (_, i) => ({
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

export const AGENTS = Array.from({ length: 14 }, (_, i) => ({
  id: `agent-${i}`,
  name: ['Nova', 'Nell', 'Marcus', 'Maya', 'Zara', 'Cleo', 'Agatha', 'Hunter', 'Iris', 'Otto', 'Vera', 'Rex', 'Juno', 'Sol'][i],
  role: 'Scout and enrich the lane it owns, then hand Krish a decision.',
  status: i % 5 === 0 ? 'degraded' : 'healthy',
  pod: ['growth', 'content', 'ops'][i % 3],
  last_run_at: daysAgo(i % 3),
  created_at: daysAgo(300),
  updated_at: daysAgo(i % 3),
}))

export const TASKS = Array.from({ length: 12 }, (_, i) => ({
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

export const SYSTEM_HEALTH = Array.from({ length: 8 }, (_, i) => ({
  id: `health-${i}`,
  component: ['ingest', 'enrichment', 'outreach', 'briefs', 'video', 'search', 'billing', 'realtime'][i],
  status: i % 4 === 0 ? 'degraded' : 'ok',
  detail: 'Last run finished inside its window.',
  checked_at: daysAgo(0),
}))

export const WORKFLOW_RUNS = Array.from({ length: 10 }, (_, i) => ({
  id: `run-${i}`,
  workflow: `flow_${i}`,
  name: `Flow ${i + 1}`,
  status: i % 5 === 0 ? 'error' : 'success',
  started_at: daysAgo(i % 3),
  finished_at: daysAgo(i % 3),
  error: null,
}))

export const CONTACTS = Array.from({ length: 24 }, (_, i) => ({
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
export function auditTables(): Record<string, unknown[]> {
  return {
    ...contentTables(),
    guests: GUESTS,
    visibility_targets: VISIBILITY_TARGETS,
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
