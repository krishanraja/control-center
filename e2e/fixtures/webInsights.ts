import type { KrishAction, WebInsightsResponse, WebPropertyView } from '../../src/lib/webProperties'

/**
 * GET /api/growth/web-insights, populated, for the Site visits panel on
 * Growth > What's moving.
 *
 * One card per verdict family the panel has to render differently, so a layout
 * or copy claim is made against the real mix rather than four copies of one:
 *   - mindmake.co: quiet, consent-gated, the rung-3 Plausible key
 *   - home.makeyourmindup.ai: ok, a trend, an AI referral, a rung-5 action
 *     with its swing
 *   - fulltime.fm: provisional, the rung-4 ruling, a closed item, a later fix
 *   - legibility.io: api_disabled, no numbers, waiting on the shared step
 * Real domains only. `@example.com` is dropped as test data by recordHygiene,
 * so a fixture using it looks populated and renders empty.
 */

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const ymd = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10)
const AS_OF = ymd(1)
const RUN_AT = iso(2 * HOUR)

/** 28 days oldest first, ending yesterday. `pick` returns null for an unmeasured day. */
function series(pick: (i: number) => number | null): Array<{ date: string; sessions: number | null }> {
  return Array.from({ length: 28 }, (_, i) => ({ date: ymd(28 - i), sessions: pick(i) }))
}

const zero = { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, pageviews: 0, keyEvents: 0, eventCount: 0 }

function action(a: Partial<KrishAction> & Pick<KrishAction, 'id' | 'prefix' | 'rung' | 'kind' | 'title' | 'why' | 'first_step' | 'job' | 'minutes' | 'detector'>): KrishAction {
  return {
    link: null,
    issued_at: iso(2 * DAY),
    expires_at: null,
    members: [],
    hero_line: null,
    alternate: null,
    writer: 'ladder',
    ...a,
  }
}

export const SHARED_ADMIN_API = action({
  id: 'shared:admin_api',
  prefix: 'shared',
  rung: 2,
  kind: 'setup',
  title: "Turn on the Google Analytics Admin API for Control Center's Google project",
  why: 'legibility.io has recorded nothing, and without this API Control Center cannot tell a wrong property id from a quiet site.',
  first_step: 'Open the link, check the project is mindmake-analytics, and press Enable. Nothing else changes.',
  job: 'keep_honest',
  minutes: 2,
  link: { label: 'Open Google Cloud', href: 'https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com?project=mindmake-analytics' },
  detector: { kind: 'admin_api_ok' },
  members: ['legibility'],
  hero_line: 'Turn on one Google setting so the sites can be checked',
})

const SITE: WebPropertyView = {
  prefix: 'site',
  label: 'mindmake.co',
  venture: 'mindmake',
  goal: 'More senior leaders who fit the face ask for the free AI brief, and one of them books a pilot.',
  canon: 'live',
  as_of: AS_OF,
  run_at: RUN_AT,
  health: 'quiet',
  flags: ['consent_gated'],
  health_line: 'Reading fine. Very few visits.',
  property_tz: 'Europe/London',
  id_source: 'env',
  totals: {
    cur: { sessions: 4, users: 4, newUsers: 3, engagedSessions: 2, pageviews: 9, keyEvents: 0, eventCount: 31 },
    prev: { sessions: 2, users: 2, newUsers: 2, engagedSessions: 1, pageviews: 3, keyEvents: 0, eventCount: 12 },
  },
  series: series(i => (i < 26 ? null : i % 3)),
  top: {
    sources: [{ name: '(direct) / (none)', sessions: 3 }, { name: 'linkedin.com / referral', sessions: 1 }],
    pages: [{ name: '/', sessions: 3 }, { name: '/brief', sessions: 1 }],
    ai: [],
    channels: [{ name: 'Direct', sessions: 3 }, { name: 'Referral', sessions: 1 }],
  },
  crosscheck: { posthog: null, plausible: null },
  insight: '4 visits this week, 3 of them from a typed address or a bookmark. Too few to call a trend.',
  fixed: [
    { id: 'timezone_learned', line: 'Learned that mindmake.co counts days in Europe/London.', at: iso(26 * HOUR) },
    { id: 'zero_held', line: 'Held back 1 empty day for mindmake.co instead of writing it as zero.', at: RUN_AT },
  ],
  closed: [],
  action: action({
    id: 'site:plausible_key',
    prefix: 'site',
    rung: 3,
    kind: 'data',
    title: 'Give Control Center your Plausible key for mindmake.co',
    why: 'Google counts only visitors who press Allow, which stays as you set it. Plausible counts every visit and holds door clicks and scoping requests. Google saw 4 sessions this week.',
    first_step: 'In Plausible open Settings, API keys, and create a Stats API key. In Vercel add it to control-center as PLAUSIBLE_API_KEY for Production, then redeploy. Or reply "GA is enough" and I will stop asking.',
    job: 'keep_honest',
    minutes: 5,
    link: { label: 'Open Plausible', href: 'https://plausible.io/settings/api-keys' },
    detector: { kind: 'plausible_ok' },
  }),
  wait_line: null,
  later: [
    { id: 'site_fixes', line: '1 small fix for mindmake.co is ready to draft: the not-found page has no tag. Say yes in chat and one PR on krishanraja/mindmake carries it.', job: 'keep_honest' },
  ],
  drafted: [],
}

const MYMU: WebPropertyView = {
  prefix: 'mymu',
  label: 'home.makeyourmindup.ai',
  venture: 'publication',
  goal: 'The newsletter publishes every week and readers subscribe free and click through to mindmake.co.',
  canon: 'live',
  as_of: AS_OF,
  run_at: RUN_AT,
  health: 'ok',
  flags: ['admin_unverified'],
  health_line: 'Reading fine.',
  property_tz: 'Europe/London',
  id_source: 'env',
  totals: {
    cur: { sessions: 42, users: 37, newUsers: 29, engagedSessions: 25, pageviews: 71, keyEvents: 0, eventCount: 240 },
    prev: { sessions: 30, users: 27, newUsers: 21, engagedSessions: 17, pageviews: 50, keyEvents: 0, eventCount: 170 },
  },
  series: series(i => 3 + (i % 5) + (i > 20 ? 2 : 0)),
  top: {
    sources: [
      { name: 'google / organic', sessions: 18 },
      { name: '(direct) / (none)', sessions: 12 },
      { name: 'substack.com / referral', sessions: 9 },
      { name: 'chatgpt.com / referral', sessions: 2 },
    ],
    pages: [{ name: '/p/same-agent-opposite-answers', sessions: 21 }, { name: '/', sessions: 14 }],
    ai: [{ name: 'chatgpt.com / referral', sessions: 2 }],
    channels: [{ name: 'Organic Search', sessions: 18 }, { name: 'Direct', sessions: 12 }, { name: 'Referral', sessions: 11 }],
  },
  crosscheck: { posthog: null, plausible: null },
  insight: 'Visits up 40% on last week, 42 against 30. Most came from Google search. 2 came from AI answers (chatgpt.com).',
  fixed: [],
  closed: [],
  action: action({
    id: `mymu:growth:${ymd(3)}`,
    prefix: 'mymu',
    rung: 5,
    kind: 'growth',
    title: 'Publish one makeyourmindup post this week',
    why: 'The last public post was 16 March, so there is nothing new for anyone to find. One idea is waiting in review: "Same agent, opposite answers".',
    first_step: 'Open Content, take that idea to a draft, and publish it on Substack.',
    job: 'feed_demand',
    minutes: 90,
    link: { label: 'Open Content', href: '#/content' },
    detector: { kind: 'substack_new_post', baseline: '2026-03-16' },
    issued_at: iso(3 * DAY),
    expires_at: iso(-11 * DAY),
    alternate: { title: 'Record a two minute voice note on the post and share it', why: 'The post that got 21 visits came from search, and a voice note is the one thing only you can make.', job: 'feed_demand' },
    writer: 'claude',
  }),
  wait_line: null,
  later: [
    { id: 'substack_count_missing', line: 'The subscriber count reads no data because Substack hides it. Export the subscriber list as CSV once and import it on People, Network, under Add people from a file.', job: 'keep_honest' },
  ],
  drafted: [
    { id: 'ai_referral', line: '2 visits came from chatgpt.com this week. The page they cite is worth keeping current.', job: 'feed_demand', routed: 'unrouted' },
  ],
}

const FULLTIME: WebPropertyView = {
  prefix: 'fulltime',
  label: 'fulltime.fm',
  venture: 'full_time',
  goal: 'Undecided. The registry, the rebrand note and the full-time repo give three different goals.',
  canon: 'ruling_owed',
  as_of: AS_OF,
  run_at: RUN_AT,
  health: 'provisional',
  flags: [],
  health_line: 'First days of data. Numbers settle within 48 hours.',
  property_tz: 'Europe/London',
  id_source: 'default',
  totals: {
    cur: { sessions: 3, users: 3, newUsers: 3, engagedSessions: 1, pageviews: 5, keyEvents: 0, eventCount: 19 },
    prev: zero,
  },
  series: series(i => (i < 27 ? null : 3)),
  top: {
    sources: [{ name: '(direct) / (none)', sessions: 2 }, { name: 'google / organic', sessions: 1 }],
    pages: [{ name: '/', sessions: 3 }],
    ai: [],
    channels: [{ name: 'Direct', sessions: 2 }, { name: 'Organic Search', sessions: 1 }],
  },
  crosscheck: { posthog: { pageviews_7d: 5, users_7d: 4, date: AS_OF }, plausible: null },
  insight: 'Counting started 27 September. 3 visits so far.',
  fixed: [{ id: 'timezone_learned', line: 'Learned that fulltime.fm counts days in Europe/London.', at: RUN_AT }],
  closed: [{ title: 'Give Control Center read access to fulltime.fm', detector: 'ga_read_ok', how: 'done', closed_at: RUN_AT }],
  action: action({
    id: 'fulltime:canon_ruling',
    prefix: 'fulltime',
    rung: 4,
    kind: 'ruling',
    title: 'Decide what fulltime.fm is for',
    why: 'Three of your own notes give it three different jobs: a career show, an experiment, and a proof piece that is not for sale. Until you pick, no growth action can name a job.',
    first_step: 'Reply in chat with one word: proof (it feeds demand for the pilot), measure (keep reading visits, no actions) or park (take the tag off). Merging the PR that follows closes this.',
    job: 'keep_honest',
    minutes: 2,
    detector: { kind: 'canon_ruled' },
    issued_at: RUN_AT,
  }),
  wait_line: null,
  later: [
    { id: 'consent_missing', line: 'fulltime.fm loads Google Analytics before asking visitors. UK rules want consent first.', job: 'keep_honest' },
  ],
  drafted: [],
}

const LEGIBILITY: WebPropertyView = {
  prefix: 'legibility',
  label: 'legibility.io',
  venture: 'legibility',
  goal: 'Undecided. Retired in the registry on 11 August, then built, priced and tagged in September.',
  canon: 'ruling_owed',
  as_of: AS_OF,
  run_at: RUN_AT,
  health: 'api_disabled',
  flags: [],
  health_line: 'Cannot be checked until one Google setting is on.',
  property_tz: null,
  id_source: 'default',
  totals: null,
  series: null,
  top: { sources: [], pages: [], ai: [], channels: [] },
  crosscheck: { posthog: { pageviews_7d: 5, users_7d: 5, date: AS_OF }, plausible: null },
  insight: 'legibility.io has recorded nothing, and with the Admin API off Control Center cannot tell a wrong property from a quiet site. PostHog counted 5 page views this week, so the site has visitors Google cannot show yet.',
  fixed: [],
  closed: [],
  action: null,
  wait_line: 'Waiting on the step at the top.',
  later: [],
  drafted: [],
}

export const WEB_INSIGHTS: WebInsightsResponse = {
  ok: true,
  generated_at: new Date(now).toISOString(),
  last_run: { run_at: RUN_AT, trigger: 'cron', status: 'success' },
  next_run_at: new Date(now + 20 * HOUR).toISOString(),
  can_refresh_at: null,
  shared_action: SHARED_ADMIN_API,
  properties: [SITE, MYMU, FULLTIME, LEGIBILITY],
}

/** What `{ ok: true }` looks like to the panel: nothing checked yet, not an error. */
export const WEB_INSIGHTS_EMPTY = { ok: true } as const

/** POST refresh inside the ten-minute window. */
export const WEB_TOO_SOON = {
  ok: false,
  error: 'too_soon',
  retry_after_s: 420,
  can_refresh_at: new Date(now + 420_000).toISOString(),
} as const
