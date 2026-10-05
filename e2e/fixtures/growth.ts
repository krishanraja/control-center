import type { Page, Route } from '@playwright/test'
import { WEB_PROPERTIES, type KrishAction, type WebInsightsResponse, type WebPrefix, type WebPropertyView } from '../../src/lib/webProperties'
import {
  addDaysIso, reviewWeekFor,
  type Channel, type CouncilReviewRow, type Coverage, type Engine, type GeoProbeRow, type ProductSlug,
  type SocialAccountRow, type TouchpointRow,
} from '../../src/lib/growth'
import type { SeoRankResponse, SeoRankRow } from '../../src/lib/growthWire'

/**
 * The Growth tab, populated, modelled on the live numbers of 2026-10-04 and
 * shaped as the real rows (src/lib/growth.ts, growthWire, webProperties):
 *
 *   populated  after Sunday's 17:00 UTC review run: five reviews for the
 *              current review week with three or four moves each, plus 40
 *              older rows (the last three weeks "numbers only").
 *   sparse     the same 40 older rows and nothing newer, so the newest week
 *              is a numbers-only review with no moves.
 *
 * Both share what does not change: 620 AI answer probes in 30 days (Advisory
 * 8 of 112, everyone else 0), four quiet sites, 33 places, 11 social accounts
 * with 7 still planned, 74 tracked Google searches, no clips this week, and
 * the $15 Getwaitlist cost. Real domains only: `@example.com` is dropped as
 * test data by recordHygiene, and a fixture using it renders empty.
 *
 * Every timestamp is relative to now, so relativeTime() reads sensibly on any
 * day the suite runs, and every week line comes from the same helpers the tab
 * uses (reviewWeekFor), so "this week's review" is this week's on any day.
 */

const DAY = 86_400_000
const HOUR = 3_600_000
const iso = (t: number) => new Date(t).toISOString()
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)
const at = (week: string, days: number, hourUtc: number) => Date.parse(`${addDaysIso(week, days)}T00:00:00Z`) + hourUtc * HOUR

/** Deterministic pseudo-random, so every run of the suite renders the same rows. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PRODUCTS: ProductSlug[] = ['ctrl', 'circle', 'pulse', 'full-time', 'mindmake']

// ── Weekly reviews (growth_council_reviews) ─────────────────────────────────

function measured(slug: ProductSlug, weekEnd: string, geo: [number, number]): string {
  const web: Partial<Record<ProductSlug, string>> = {
    mindmake: `web 0 visits in the 7 days to ${weekEnd} (Google Analytics on mindmake.co, visitors who allowed cookies only)`,
    'full-time': `web 3 visits in the 7 days to ${weekEnd} (Google Analytics on fulltime.fm)`,
  }
  return [
    web[slug] ?? 'traffic unknown (no emitter)',
    'signups unknown this week',
    `GEO ${geo[0]}/${geo[1]} cited`,
    'AEO unknown (no digest this week)',
    'customers table: paid 0, MRR $0, churned 0',
    `touchpoints ${slug === 'circle' || slug === 'pulse' ? 6 : 7} (unaddressed 5, in_progress 1)`,
  ].join(' | ')
}

const CURRENT: Record<ProductSlug, { headline: string; findings: Record<string, string>; double_down: string[]; kill_list: string[]; geo: [number, number] }> = {
  mindmake: {
    headline: 'AI answers named you 8 times in 112 this month, up from 1 a week to 3. LinkedIn is still named far more often.',
    findings: {
      geo: '8 of 112 answers named Advisory. linkedin.com was named in 41 of them and fractionus.com in 19.',
      traffic: 'mindmake.co had 0 visits this week and 3 the week before. It only counts visitors who press Allow.',
      pipeline: 'One approach is drafted and has not been sent. No paid pilots started this month.',
      structural_blocker: 'The site has no page that answers "who can run an AI pilot for my company", the question where you are missed most.',
    },
    double_down: [
      'Publish one page that answers "who can run an AI pilot for a 200-person company"',
      'Send the drafted approach before Wednesday',
      'Turn last week\'s pilot call notes into a 60-second clip',
      'Ask one past client for a two-line quote for the home page',
    ],
    kill_list: ['Stop posting the same words on LinkedIn and the newsletter on the same day'],
    geo: [3, 28],
  },
  ctrl: {
    headline: 'No AI answer named CTRL in 124 tries. Answers point people to policy templates on g2.com and linkedin.com instead.',
    findings: {
      geo: '0 of 124 answers named CTRL. g2.com was named in 37 and linkedin.com in 33.',
      traffic: 'Visits are unknown: CTRL has no visit counter yet. That is unmeasured, not zero.',
    },
    double_down: [
      'Write a free AI use policy template page with CTRL named in it',
      'Ask three CTRL users for one sentence each about why they use it',
      'Add CTRL to two software review sites',
    ],
    kill_list: [],
    geo: [0, 31],
  },
  circle: {
    headline: 'No AI answer named Circle in 108 tries. connectd.com and fractionus.com are named when people ask where fractional leaders find work.',
    findings: {
      geo: '0 of 108 answers named Circle. connectd.com was named in 29 and fractionus.com in 26.',
      blocker: 'The Circle Substack is planned but does not exist, so the members page has nowhere to point.',
    },
    double_down: [
      'Write one LinkedIn post a week about how a fractional leader finds their next client',
      'Create the Circle Substack so the members page has somewhere to point',
      'List Circle on the two directories AI answers name most',
    ],
    kill_list: ['Stop waiting for 50 members before starting the newsletter'],
    geo: [0, 27],
  },
  pulse: {
    headline: 'No AI answer named Pulse in 139 tries. People asking how to track hours across clients are sent to toptal.com and upwork.com.',
    findings: {
      geo: '0 of 139 answers named Pulse. upwork.com was named in 44 and toptal.com in 31.',
      spend: 'Getwaitlist costs $15 a month and is not connected to anything.',
    },
    double_down: [
      'Rewrite the Pulse home page headline around tracking hours for several clients',
      'Decide whether Pulse keeps its paid waitlist page',
      'Write one comparison page: Pulse next to a spreadsheet',
    ],
    kill_list: [],
    geo: [0, 34],
  },
  'full-time': {
    headline: 'No AI answer named Full Time in 137 tries. fulltime.fm had 3 visits this week, the first since its counter went live.',
    findings: {
      geo: '0 of 137 answers named Full Time. linkedin.com was named in 52 and indeed.com in 30.',
      traffic: 'fulltime.fm had 3 visits this week and none the week before.',
      blocker: 'Instagram, TikTok and X are planned for Full Time and none of them exist yet.',
    },
    double_down: [
      'Film one 60-second clip on what to say in the first week after a layoff',
      'Create the Full Time Instagram account so clips have a home',
      'Add the show to two podcast directories',
    ],
    kill_list: [],
    geo: [0, 34],
  },
}

const AUGUST_HEADLINE: Record<ProductSlug, string> = {
  mindmake: 'One AI answer named you this week. The rest named linkedin.com.',
  ctrl: 'No answer named CTRL. Policy template pages win these questions.',
  circle: 'No answer named Circle. Directories win the "find fractional work" questions.',
  pulse: 'No answer named Pulse. Freelance marketplaces win the time tracking questions.',
  'full-time': 'No answer named Full Time. Job boards win every question.',
}

export function growthReviews(now: number, withCurrent: boolean): CouncilReviewRow[] {
  const current = reviewWeekFor(new Date(now))
  const rows: CouncilReviewRow[] = []
  // Eight older weeks: the five oldest real, the three newest numbers only.
  // Sparse has nothing newer, so its newest numbers-only week IS this week's.
  const offset = withCurrent ? 1 : 0
  for (let k = 7; k >= 0; k--) {
    const w = k + offset
    const weekStart = addDaysIso(current, -7 * w)
    const writtenAt = at(weekStart, 6, 17)
    const degraded = k <= 2
    for (const slug of PRODUCTS) {
      const m = measured(slug, ymd(writtenAt - DAY), slug === 'mindmake' ? [degraded ? 2 : 1, 28] : [0, 30])
      rows.push({
        id: `rev-${weekStart}-${slug}`,
        week_start: weekStart,
        product_slug: slug,
        findings: degraded
          ? { headline: `Evidence-only review: ${m}`, degraded: 'evidence-only: the writing pass was unavailable, so no calls were made', measured: m }
          : { headline: AUGUST_HEADLINE[slug], geo: 'See the probe rows for this week.', measured: m },
        kill_list: [],
        double_down: degraded ? [] : ['Write one page for the question you are missed on most', 'Post twice on the channel your buyers use'],
        krish_decision: null,
        decided_at: null,
        created_at: iso(writtenAt),
      })
    }
  }
  if (withCurrent) {
    for (const slug of PRODUCTS) {
      const t = CURRENT[slug]
      rows.push({
        id: `rev-${current}-${slug}`,
        week_start: current,
        product_slug: slug,
        findings: { headline: t.headline, ...t.findings, measured: measured(slug, addDaysIso(current, 6), t.geo) },
        kill_list: t.kill_list,
        double_down: t.double_down,
        krish_decision: null,
        decided_at: null,
        created_at: iso(Math.min(now - 95 * 60_000, at(current, 6, 17) + 5 * 60_000)),
      })
    }
  }
  return rows.sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : a.product_slug.localeCompare(b.product_slug)))
}

// ── AI answer probes (growth_geo_probes) ────────────────────────────────────

const QUESTIONS: Record<ProductSlug, string[]> = {
  mindmake: [
    'Who can help a 200-person company run its first AI pilot?',
    'Best AI advisor for a CEO who is not technical',
    'How do I get my leadership team to agree on AI?',
    'AI strategy workshop for an executive team',
    'Fractional AI advisor for a mid-size company',
    'Who runs AI training for senior leaders?',
    'How much does an AI pilot cost for a company like mine?',
  ],
  ctrl: [
    'AI use policy template for a small business',
    'How to stop staff pasting client data into ChatGPT',
    'Tool to keep track of how my team uses AI',
    'AI rules for employees, simple version',
    'Software to approve AI use at work',
    'AI risk checklist for a professional services firm',
  ],
  circle: [
    'Where do fractional executives find work?',
    'Communities for fractional CMOs',
    'How to get your first fractional client',
    'Best network for part-time executives',
    'How do fractional CFOs find clients?',
  ],
  pulse: [
    'How to track hours across several fractional clients',
    'Best time tracking for fractional executives',
    'How to show a client what I did this month',
    'Simple timesheet for consultants with retainers',
    'Retainer usage report for clients',
  ],
  'full-time': [
    'How to get hired after a layoff',
    'Podcast for people looking for a new job',
    'How to explain a gap on my CV',
    'What to do in the first week after being laid off',
    'How to network when you have just lost your job',
    'Who talks honestly about unemployment?',
  ],
}

const RIVALS: Record<ProductSlug, Array<[string, number]>> = {
  mindmake: [['linkedin.com', 0.37], ['fractionus.com', 0.17], ['connectd.com', 0.12], ['forbes.com', 0.1]],
  ctrl: [['g2.com', 0.3], ['linkedin.com', 0.27], ['forbes.com', 0.12], ['reddit.com', 0.1]],
  circle: [['connectd.com', 0.27], ['fractionus.com', 0.24], ['linkedin.com', 0.22]],
  pulse: [['upwork.com', 0.32], ['toptal.com', 0.22], ['linkedin.com', 0.14]],
  'full-time': [['linkedin.com', 0.38], ['indeed.com', 0.22], ['reddit.com', 0.14]],
}

const ENGINES: Engine[] = ['chatgpt', 'perplexity', 'google_aio']
const WEEKLY: Record<ProductSlug, number[]> = {
  mindmake: [28, 28, 28, 28], ctrl: [31, 31, 31, 31], circle: [27, 27, 27, 27], pulse: [35, 35, 35, 34], 'full-time': [34, 34, 34, 35],
}
/** Advisory's named answers per weekly run, oldest first: 1, 2, 2, 3 = 8 of 112. */
const ADVISORY_CITED = [1, 2, 2, 3]

export function growthProbes(now: number): GeoProbeRow[] {
  // Four Monday runs, newest one this week or last, all inside 30 days.
  const monday = Date.parse(`${addDaysIso(reviewWeekFor(new Date(now)), 7)}T06:00:00Z`)
  const newest = monday <= now ? monday : monday - 7 * DAY
  const runs = [3, 2, 1, 0].map(w => newest - w * 7 * DAY)
  const out: GeoProbeRow[] = []
  const r = rng(7)
  for (const slug of PRODUCTS) {
    const qs = QUESTIONS[slug]
    runs.forEach((runAt, wi) => {
      const n = WEEKLY[slug][wi]
      const cited = new Set<number>()
      if (slug === 'mindmake') while (cited.size < ADVISORY_CITED[wi]) cited.add(Math.floor(r() * n))
      for (let i = 0; i < n; i++) {
        const q = qs[i % qs.length]
        const rivals = RIVALS[slug].filter(([, p]) => r() < p * 2.2).map(([d]) => d).slice(0, 3)
        if (rivals.length === 0) rivals.push(RIVALS[slug][0][0])
        const named = cited.has(i)
        out.push({
          id: `probe-${slug}-${wi}-${i}`,
          product_slug: slug,
          question: q,
          engine: ENGINES[i % ENGINES.length],
          answer_snapshot: `There are a few good routes for "${q.toLowerCase().replace(/[?]$/, '')}". Most people start with their own network, and ${rivals[0]} is where that usually happens.${rivals[1] ? ` ${rivals[1]} lists people who do this work and lets you compare them.` : ''}${named ? ' Mindmake is one of the independent options named for this kind of work.' : ''} Ask for one example of similar work before you agree to anything.`,
          we_cited: named,
          competitors_cited: rivals,
          touchpoint_id: null,
          run_at: iso(runAt + i * 41_000),
          subject_kind: 'venture',
          subject_id: null,
          run_id: null,
          query_id: null,
        })
      }
    })
  }
  return out.sort((a, b) => (a.run_at < b.run_at ? 1 : -1))
}

// ── Site visits (GET /api/growth/web-insights) ──────────────────────────────

type Seed = { cur: number; prev: number; flags: WebPropertyView['flags']; action: Pick<KrishAction, 'id' | 'rung' | 'kind' | 'title' | 'why' | 'first_step' | 'job' | 'minutes' | 'link'> }

const SITES: Record<WebPrefix, Seed> = {
  site: {
    cur: 0, prev: 3, flags: ['consent_gated'],
    action: {
      id: 'site:growth:pilot-draft', rung: 5, kind: 'growth',
      title: 'Move the one drafted approach on the Advisory list to sent',
      why: 'mindmake.co had 0 visits this week and 3 the week before. The one approach already drafted is the shortest way to a pilot this month.',
      first_step: 'Open the Advisory list, read the draft once, change one line so it sounds like you, and send it.',
      job: 'fill_pilots', minutes: 20, link: { label: 'Open the Advisory list', href: '#/people?lane=pilots' },
    },
  },
  mymu: {
    cur: 0, prev: 3, flags: [],
    action: {
      id: 'mymu:substack_new_post', rung: 5, kind: 'growth',
      title: 'Publish this week\'s newsletter post, the first since 16 March',
      why: 'Nothing has gone out since 16 March, six and a half months. The newsletter had 0 visits this week and 3 the week before.',
      first_step: 'Pick one thing you said on a call this week and write it up in 600 words. Publish it as it is.',
      job: 'feed_demand', minutes: 90, link: { label: 'Open Substack', href: 'https://home.makeyourmindup.ai/publish' },
    },
  },
  fulltime: {
    cur: 3, prev: 0, flags: [],
    action: {
      id: 'fulltime:canon_ruling', rung: 4, kind: 'ruling',
      title: 'Decide what fulltime.fm is for',
      why: 'Three of your own notes give it three different jobs, so the daily check cannot tell what better looks like.',
      first_step: 'Pick one answer. You can change it later.',
      job: 'keep_honest', minutes: 2, link: null,
    },
  },
  legibility: {
    cur: 3, prev: 0, flags: [],
    action: {
      id: 'legibility:canon_ruling', rung: 4, kind: 'ruling',
      title: 'Decide whether legibility.io is live',
      why: 'It was marked as retired on 11 August, yet this month it got 17 updates, paid plans and a visit counter.',
      first_step: 'Pick one answer. You can change it later.',
      job: 'keep_honest', minutes: 2, link: null,
    },
  },
}

function series(now: number, cur: number, prev: number, seed: number) {
  const r = rng(seed)
  const days: Array<{ date: string; sessions: number | null }> = []
  for (let i = 27; i >= 0; i--) days.push({ date: ymd(now - (i + 1) * DAY), sessions: 0 })
  const place = (total: number, from: number, to: number) => {
    for (let k = 0; k < total; k++) {
      const idx = from + Math.floor(r() * (to - from))
      days[idx].sessions = (days[idx].sessions ?? 0) + 1
    }
  }
  place(prev, 14, 21)
  place(cur, 21, 28)
  place(seed % 2 ? 2 : 1, 0, 14)
  return days
}

export function growthWebInsights(now: number): WebInsightsResponse {
  const lastRun = now - 13 * HOUR
  const win = (sessions: number) => ({ sessions, users: sessions, newUsers: sessions, engagedSessions: Math.max(0, sessions - 1), pageviews: sessions * 2, keyEvents: 0, eventCount: sessions * 5 })
  const properties: WebPropertyView[] = WEB_PROPERTIES.map((p, i) => {
    const s = SITES[p.prefix]
    return {
      prefix: p.prefix,
      label: p.label,
      venture: p.venture,
      goal: p.goal,
      canon: p.canon.status,
      as_of: ymd(now - DAY),
      run_at: iso(lastRun),
      health: 'quiet',
      flags: s.flags,
      health_line: 'Reading fine. Very few visits.',
      property_tz: 'Europe/London',
      id_source: p.defaultId ? 'default' : 'env',
      totals: { cur: win(s.cur), prev: win(s.prev) },
      series: series(now, s.cur, s.prev, 11 + i),
      top: { sources: [], pages: [], ai: [], channels: [] },
      crosscheck: { posthog: null, plausible: null },
      insight: s.action.why,
      fixed: [],
      closed: [],
      action: {
        ...s.action,
        prefix: p.prefix,
        detector: { kind: s.action.kind === 'ruling' ? 'canon_ruled' : p.prefix === 'mymu' ? 'substack_new_post' : 'pilot_state_advanced' },
        issued_at: iso(now - 3 * DAY),
        expires_at: s.action.rung === 5 ? iso(now + 11 * DAY) : null,
        members: [],
        hero_line: null,
        alternate: null,
        writer: s.action.kind === 'ruling' ? 'ladder' : 'claude',
      },
      wait_line: null,
      later: [],
      drafted: [],
    }
  })
  return {
    ok: true,
    generated_at: iso(now),
    last_run: { run_at: iso(lastRun), trigger: 'cron', status: 'ok' },
    next_run_at: iso(now + 11 * HOUR),
    can_refresh_at: null,
    shared_action: null,
    properties,
  }
}

// ── Places (growth_touchpoints) and social accounts ─────────────────────────

const PLACES: Array<[ProductSlug, Channel, string, string, number, Coverage, string | null]> = [
  ['full-time', 'social_organic', 'Instagram reels about job hunting after a layoff', 'Laid-off product managers in their first month', 9, 'unaddressed', 'Needs the Full Time Instagram account to exist first.'],
  ['full-time', 'social_organic', 'TikTok career advice for people over 35', 'Senior people who just lost a job', 8, 'unaddressed', 'Needs the Full Time TikTok account to exist first.'],
  ['full-time', 'podcast', 'Apple and Spotify podcast directories', 'People looking for a job search show', 7, 'in_progress', null],
  ['full-time', 'community', 'r/jobs and r/layoffs threads', 'People asking what to do after a layoff', 6, 'unaddressed', 'Who posts here: you or Zara?'],
  ['full-time', 'social_organic', 'X threads on hiring freezes', 'Recruiters and laid-off staff', 5, 'unaddressed', 'Needs the Full Time X account to exist first.'],
  ['full-time', 'seo', 'Google searches for "how to explain a gap on my CV"', 'Job seekers writing their CV', 6, 'unaddressed', null],
  ['full-time', 'substack', 'Career newsletters that swap guest posts', 'Readers of job search newsletters', 4, 'unaddressed', 'Is a guest post worth it before the show has 10 episodes?'],
  ['mindmake', 'social_organic', 'LinkedIn posts from CEOs about AI plans', 'CEOs of 100 to 500 person companies starting on AI', 9, 'in_progress', null],
  ['mindmake', 'substack', 'The makeyourmindup newsletter', 'Senior leaders who read about AI weekly', 8, 'in_progress', 'Is the newsletter still the main way in, after six months without a post?'],
  ['mindmake', 'geo', 'AI answers to "who can run an AI pilot for my company"', 'Leaders asking AI tools for an advisor', 8, 'unaddressed', null],
  ['mindmake', 'partner', 'Executive coaches who get asked about AI', 'Their CEO clients', 7, 'unaddressed', 'Which two coaches would actually refer?'],
  ['mindmake', 'maven', 'The Maven course page', 'Leaders who want a structured course', 6, 'covered', null],
  ['mindmake', 'podcast', 'Business podcasts that interview advisors', 'Founders who listen on the commute', 5, 'unaddressed', null],
  ['mindmake', 'community', 'Private CEO peer groups', 'CEOs comparing notes on AI', 7, 'unaddressed', 'Who in your network runs one?'],
  ['ctrl', 'seo', 'Google searches for "AI use policy template"', 'Office managers asked to write an AI policy', 9, 'unaddressed', null],
  ['ctrl', 'geo', 'AI answers about safe AI use at work', 'Owners asking how to stop data leaks', 8, 'unaddressed', null],
  ['ctrl', 'product', 'Software review sites', 'Buyers comparing tools that keep AI use at work safe', 7, 'unaddressed', 'Which two review sites matter for a tool this size?'],
  ['ctrl', 'social_organic', 'LinkedIn posts from IT managers', 'IT leads at 50 to 300 person firms', 6, 'unaddressed', null],
  ['ctrl', 'partner', 'Managed IT providers', 'Their small business clients', 7, 'unaddressed', 'Would a reseller deal make sense yet?'],
  ['ctrl', 'social_organic', 'YouTube how-to videos on AI rules at work', 'Managers looking for a quick explainer', 5, 'unaddressed', 'Needs the CTRL YouTube channel to exist first.'],
  ['ctrl', 'community', 'r/sysadmin threads about ChatGPT at work', 'Admins asked to control AI use', 4, 'retired', null],
  ['circle', 'social_organic', 'LinkedIn posts by fractional leaders', 'Fractional CMOs, CFOs and COOs looking for work', 9, 'in_progress', null],
  ['circle', 'substack', 'A Circle newsletter for members and prospects', 'Fractional leaders who want referrals', 8, 'unaddressed', 'Needs the Circle Substack to exist first.'],
  ['circle', 'community', 'Directories of fractional executives', 'Companies hiring a part-time leader', 7, 'unaddressed', null],
  ['circle', 'geo', 'AI answers to "where do fractional executives find work"', 'Leaders going fractional', 7, 'unaddressed', null],
  ['circle', 'partner', 'Recruiters who place interim executives', 'Their candidates', 5, 'unaddressed', 'Would a recruiter send people to a paid community?'],
  ['circle', 'social_organic', 'A Circle company page on LinkedIn', 'People who see members post', 4, 'unaddressed', 'Needs the Circle LinkedIn page to exist first.'],
  ['pulse', 'seo', 'Google searches for "track hours for several clients"', 'Fractional leaders billing by the hour', 9, 'unaddressed', null],
  ['pulse', 'geo', 'AI answers about tracking retainer hours', 'Consultants asking AI for a tool', 8, 'unaddressed', null],
  ['pulse', 'community', 'Circle members', 'Fractional leaders already in Circle', 8, 'in_progress', null],
  ['pulse', 'social_organic', 'A Pulse company page on LinkedIn', 'Fractional leaders comparing tools', 5, 'unaddressed', 'Needs the Pulse LinkedIn page to exist first.'],
  ['pulse', 'product', 'The paid waitlist page', 'People who heard about Pulse', 4, 'unaddressed', 'Keep paying $15 a month for a waitlist nobody is pointed at?'],
  ['pulse', 'partner', 'Bookkeepers who serve consultants', 'Their consultant clients', 6, 'unaddressed', null],
]

export function growthTouchpoints(now: number): TouchpointRow[] {
  return PLACES.map(([product, channel, place, who, score, coverage, flag], i) => ({
    id: `tp-${i + 1}`,
    product_slug: product,
    icp_trigger: who,
    channel,
    watering_hole: place,
    cost_efficiency_score: score,
    coverage_status: coverage,
    owner_agent: channel === 'seo' || channel === 'geo' ? 'maya' : 'zara',
    rationale: null,
    evidence: null,
    assumption_flag: flag,
    created_at: iso(now - 61 * DAY),
    updated_at: iso(now - 60 * DAY),
  }))
}

export function growthAccounts(): SocialAccountRow[] {
  const a = (id: string, product_slug: ProductSlug, platform: string, status: SocialAccountRow['status'], handle: string | null = null, profile_url: string | null = null): SocialAccountRow =>
    ({ id, product_slug, platform, handle, profile_url, status, notes: null })
  return [
    a('acct-1', 'mindmake', 'linkedin', 'live', 'krishraja', 'https://www.linkedin.com/in/krishraja'),
    a('acct-2', 'mindmake', 'substack', 'live', 'mindmakerlive', 'https://home.makeyourmindup.ai/'),
    a('acct-3', 'full-time', 'youtube', 'live', '@fulltimefm', 'https://youtube.com/@fulltimefm'),
    a('acct-4', 'ctrl', 'linkedin', 'live', 'mm-ctrl', 'https://www.linkedin.com/company/mm-ctrl'),
    a('acct-5', 'full-time', 'instagram', 'planned'),
    a('acct-6', 'full-time', 'tiktok', 'planned'),
    a('acct-7', 'full-time', 'x', 'planned'),
    a('acct-8', 'circle', 'substack', 'planned'),
    a('acct-9', 'circle', 'linkedin', 'planned'),
    a('acct-10', 'pulse', 'linkedin', 'planned'),
    a('acct-11', 'ctrl', 'youtube', 'planned'),
  ]
}

// ── Google (GET /api/growth/seo-rank) ───────────────────────────────────────

const KEYWORDS: Array<[string, string, number, number | null]> = [
  ['legibility', 'MCP server', 60500, null],
  ['fractionl_circle', 'fractional cmo', 14800, null],
  ['fractionl_pulse', 'time tracking for consultants', 9900, null],
  ['mm_ctrl', 'ai governance', 8100, null],
  ['full_time', 'job search after layoff', 5400, 41],
  ['mm_ctrl', 'ai use policy template', 4400, null],
  ['fractionl_circle', 'fractional executive jobs', 3600, null],
  ['legibility', 'llms.txt generator', 2900, 14],
  ['fractionl_pulse', 'retainer hours tracker', 1900, null],
  ['full_time', 'unemployment podcast', 1300, 7],
  ['mm_ctrl', 'chatgpt policy for employees', 1300, 68],
  ['fractionl_circle', 'fractional leadership community', 880, 23],
]
const FILLER: Record<string, string[]> = {
  legibility: ['ai readable website', 'make site readable by ai', 'llm website audit', 'structured data for ai', 'ai crawler checker', 'agent friendly website', 'website for ai assistants', 'ai search visibility tool', 'llm seo checker', 'ai sitemap', 'ai ready content', 'chatgpt website visibility'],
  mm_ctrl: ['ai risk assessment template', 'shadow ai tools', 'ai acceptable use policy', 'employee ai training', 'ai compliance small business', 'track ai usage at work', 'ai approval workflow', 'safe ai use at work', 'ai audit checklist', 'generative ai policy', 'ai tool inventory', 'ai rules for staff', 'ai data leak prevention', 'copilot policy template'],
  fractionl_circle: ['fractional cfo network', 'how to become a fractional executive', 'fractional coo jobs', 'part time executive roles', 'fractional leader referrals', 'interim executive community', 'fractional cmo salary', 'fractional work community', 'fractional executive directory', 'find fractional clients', 'fractional consultant network'],
  fractionl_pulse: ['consultant timesheet', 'track hours multiple clients', 'retainer report template', 'client hours dashboard', 'billable hours app', 'fractional time tracking', 'monthly client report', 'hours used on retainer', 'simple time tracker', 'client portal hours', 'timesheet for retainers', 'track consulting hours'],
  full_time: ['what to do after being laid off', 'explain gap in cv', 'career change after redundancy', 'job hunting tips', 'networking after layoff', 'how long to find a job', 'interview after unemployment', 'layoff support podcast', 'redundancy advice', 'job search motivation', 'senior job search', 'first week after layoff', 'job search burnout'],
}

export function growthSeoRank(now: number): SeoRankResponse {
  const checked = iso(now - 5 * DAY)
  const rows: SeoRankRow[] = KEYWORDS.map(([product, keyword, vol, pos], i) => ({
    id: `rank-${i}`, keyword, product, position: pos, previous_position: pos ? pos + (i % 2 ? 3 : -2) : null,
    monthly_searches: vol, priority: i < 10 ? 10 - i : null, impressions: null, clicks: null, checked_at: checked,
  }))
  const r = rng(3)
  let i = rows.length
  for (const [product, words] of Object.entries(FILLER)) {
    for (const keyword of words) {
      if (rows.length >= 74) break
      rows.push({ id: `rank-${i++}`, keyword, product, position: null, previous_position: null, monthly_searches: Math.round(50 + r() * 700), priority: null, impressions: null, clicks: null, checked_at: checked })
    }
  }
  return { ok: true, checked_at: checked, count: rows.length, rows }
}

// ── Spend (acquisition overview) ────────────────────────────────────────────

export const GROWTH_OVERVIEW = {
  ok: true,
  lanes: [],
  queued_preview: [],
  unassigned_churn: [],
  content_attribution: [],
  integrations: [
    { tool: 'PostHog', category: 'analytics', job: 'Product analytics', status: 'wired', lanes: [], monthly_usd: 0, usage_metered: false, gated_reason: null, notes: null },
    { tool: 'Getwaitlist', category: 'waitlist', job: 'Pulse waitlist page', status: 'pending', lanes: ['fractionl_pulse'], monthly_usd: 15, usage_metered: false, gated_reason: null, notes: 'Paid monthly. Not connected to anything.' },
  ],
}

/** The growth tables, keyed the way the PostgREST mocks look them up. */
export function growthTables(kind: 'populated' | 'sparse' = 'populated', now = Date.now()): Record<string, unknown[]> {
  return {
    growth_council_reviews: growthReviews(now, kind === 'populated'),
    growth_geo_probes: growthProbes(now),
    growth_touchpoints: growthTouchpoints(now),
    growth_social_accounts: growthAccounts(),
    growth_creative_queue: [],
  }
}

/**
 * The Growth routes over a page whose catch-alls are already registered
 * (Playwright checks handlers in REVERSE registration order, so call this
 * after them). Tables go in through the caller's PostgREST catch-all.
 */
export async function mockGrowthRoutes(page: Page, opts: { now?: number; web?: unknown } = {}) {
  const now = opts.now ?? Date.now()
  await page.route('**/api/growth/seo-rank*', (r: Route) => r.fulfill({ json: growthSeoRank(now) }))
  await page.route('**/api/acquisition/overview*', (r: Route) => r.fulfill({ json: GROWTH_OVERVIEW }))
  await page.route('**/api/growth/web-insights*', (r: Route) => {
    if (r.request().method() === 'POST') return r.fulfill({ status: 429, json: { ok: false, error: 'Checked less than 10 minutes ago.', retry_after_s: 420 } })
    return r.fulfill({ json: opts.web ?? growthWebInsights(now) })
  })
}
