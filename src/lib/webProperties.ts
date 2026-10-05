// The four sites Google Analytics reads, and every type the site-visits check
// writes and the Growth tab reads.
//
// ONE registry. The snapshot (api/growth/snapshot.ts), the daily check
// (api/growth/web-insights.ts), the council and the Growth panel all read it,
// so adding a site is one entry here and nothing else: web_property_insights
// has no CHECK on `property` on purpose.
//
// Zero imports, no DOM, no import.meta and no @/ alias, because this file is
// compiled twice: by the app (tsconfig.json) and by the serverless tree
// (tsconfig.api.json, NodeNext). The API imports it as
// '../src/lib/webProperties.js', the UI as '../../lib/webProperties'.
//
// Two rules the shape encodes:
//   - `label` is the domain and is what a card is titled. It is never
//     ventureLabel(prefix): 'site' is a metric-key prefix, not a venture.
//   - An unknown is never a zero. Every number on the wire is nullable where
//     it can be unmeasured, and HEALTH_LINE says why before any number shows.

export type WebPrefix = 'site' | 'mymu' | 'fulltime' | 'legibility'
/** Same ids as api/_mission.ts Job and src/content/jobs.ts Job (a test asserts equality). */
export type WebJob = 'fill_pilots' | 'keep_honest' | 'run_pilots' | 'feed_demand' | 'keep_edge'
export type WebCanon =
  | { status: 'live' }
  | { status: 'ruling_owed'; question: string; conflict: string; options: string[] }
  | { status: 'measure_only' }
  | { status: 'retired' }

export interface WebProperty {
  prefix: WebPrefix              // permanent: growth_metrics keys, web_analytics_daily.property, insight rows
  label: string                  // the domain, rendered as the card title. NEVER ventureLabel(prefix)
  about: string                  // noun phrase used inside copy
  host: string                   // canonical host: probes and the hostName filter
  hostAliases: string[]
  probeUrl: string
  measurementId: string          // G- id the page must carry and the stream must match
  env: string                    // optional override of the numeric property id
  defaultId?: string             // numeric property id shipped in code (not a secret)
  venture: string                // venture_registry slug; the UI chip is ventureLabel(venture)
  touchpointSlug: 'mindmake' | 'full-time' | 'publication' | null  // growth_touchpoints CHECK set
  councilSlug: 'mindmake' | 'full-time' | 'legibility' | null      // council-run PRODUCTS
  posthogProduct: 'full_time' | 'legibility' | null                // product_metrics.product
  plausibleSiteId: string | null
  plausible?: 'declined'         // set only by a Krish-ruling PR; clears rung 3
  repo: string | null            // where a site fix would be drafted (never written from the OS)
  sitemapUrl: string | null
  rssUrl: string | null
  substackArchiveUrl: string | null
  jobs: WebJob[]                 // [] unless canon.status === 'live'
  goal: string                   // what better results means here, one plain line
  canon: WebCanon
  tagLiveAt: string              // ISO instant the tag went live on the page
  consentByDesign: boolean       // true only for mindmake.co (Krish's r31 call; never auto-changed)
  neverPublishName: boolean      // true for fulltime.fm (full-time NOW.md never_publish)
}

export const WEB_PROPERTIES: readonly WebProperty[] = [
  { prefix: 'site', label: 'mindmake.co', about: 'mindmake.co', host: 'mindmake.co', hostAliases: ['www.mindmake.co'],
    probeUrl: 'https://mindmake.co/', measurementId: 'G-SMXQH8E4CM', env: 'GA4_PROPERTY_MINDMAKE_SITE',
    venture: 'mindmake', touchpointSlug: 'mindmake', councilSlug: 'mindmake', posthogProduct: null,
    plausibleSiteId: 'mindmake.co', plausible: 'declined', repo: 'krishanraja/mindmake', sitemapUrl: 'https://mindmake.co/sitemap.xml',
    rssUrl: null, substackArchiveUrl: null, jobs: ['fill_pilots'],
    goal: 'More senior leaders who fit the face ask for the free AI brief, and one of them books a pilot.',
    canon: { status: 'live' }, tagLiveAt: '2026-09-25T00:00:00Z', consentByDesign: true, neverPublishName: false },
  { prefix: 'mymu', label: 'mindmakerlive.substack.com', about: 'the makeyourmindup newsletter',
    host: 'mindmakerlive.substack.com', hostAliases: [], probeUrl: 'https://mindmakerlive.substack.com/',
    measurementId: 'G-VC5V9LDE17', env: 'GA4_PROPERTY_MAKEYOURMINDUP', venture: 'publication',
    touchpointSlug: 'publication', councilSlug: null, posthogProduct: null, plausibleSiteId: null, repo: null,
    sitemapUrl: null, rssUrl: null,
    substackArchiveUrl: 'https://mindmakerlive.substack.com/api/v1/archive?sort=new&limit=1',
    jobs: ['feed_demand'], goal: 'The newsletter publishes every week and readers subscribe free and click through to mindmake.co.',
    canon: { status: 'live' }, tagLiveAt: '2026-09-25T00:00:00Z', consentByDesign: false, neverPublishName: false },
  { prefix: 'fulltime', label: 'fulltime.fm', about: 'fulltime.fm', host: 'fulltime.fm', hostAliases: ['www.fulltime.fm'],
    probeUrl: 'https://fulltime.fm/', measurementId: 'G-W2QL8RKFJ1', env: 'GA4_PROPERTY_FULLTIME', defaultId: '556143202',
    venture: 'full_time', touchpointSlug: 'full-time', councilSlug: 'full-time', posthogProduct: 'full_time',
    plausibleSiteId: null, repo: 'krishanraja/full-time', sitemapUrl: 'https://fulltime.fm/sitemap.xml',
    rssUrl: 'https://fulltime.fm/api/public/feed.rss', substackArchiveUrl: null, jobs: [],
    goal: 'Undecided. The registry, the rebrand note and the full-time repo give three different goals.',
    canon: { status: 'ruling_owed', question: 'What is fulltime.fm for?',
      conflict: 'Three of your own notes give it three different jobs: a career show, an experiment, and a proof piece that is not for sale.',
      options: ['proof', 'measure', 'park'] },
    tagLiveAt: '2026-09-27T09:56:53Z', consentByDesign: false, neverPublishName: true },
  { prefix: 'legibility', label: 'legibility.io', about: 'legibility.io', host: 'legibility.io', hostAliases: ['www.legibility.io'],
    probeUrl: 'https://legibility.io/', measurementId: 'G-J5173WPD98', env: 'GA4_PROPERTY_LEGIBILITY', defaultId: '556114272',
    venture: 'legibility', touchpointSlug: null, councilSlug: 'legibility', posthogProduct: 'legibility',
    plausibleSiteId: null, repo: 'krishanraja/legibility', sitemapUrl: 'https://legibility.io/sitemap.xml',
    rssUrl: null, substackArchiveUrl: null, jobs: [],
    goal: 'Undecided. Retired in the registry on 11 August, then built, priced and tagged in September.',
    canon: { status: 'ruling_owed', question: 'Is legibility.io live?',
      conflict: 'It was marked as retired on 11 August. This month it still got 17 updates, paid plans and a visit counter.',
      options: ['live', 'measure', 'retire'] },
    tagLiveAt: '2026-09-27T09:57:16Z', consentByDesign: false, neverPublishName: false },
]

export const WEB_METRIC_SUFFIXES = ['sessions_1d', 'users_1d', 'pageviews_1d', 'key_events_1d'] as const

export function webProperty(prefix: string): WebProperty | undefined {
  return WEB_PROPERTIES.find(p => p.prefix === prefix)
}

/** `${p.prefix}_${suffix}` x4, in WEB_METRIC_SUFFIXES order. */
export function webMetricKeys(p: WebProperty): string[] {
  return WEB_METRIC_SUFFIXES.map(s => `${p.prefix}_${s}`)
}

/** Trimmed env override wins, then the code default. */
export function ga4PropertyId(p: WebProperty, env: Record<string, string | undefined>): { id: string; from: 'env' | 'default' | 'none' } {
  const fromEnv = (env[p.env] ?? '').trim()
  if (fromEnv) return { id: fromEnv, from: 'env' }
  if (p.defaultId) return { id: p.defaultId, from: 'default' }
  return { id: '', from: 'none' }
}

// ---------- answering a ruling from the dashboard ----------
//
// A site whose canon is 'ruling_owed' carries a rung-4 action ("Decide what
// fulltime.fm is for"). Its detector, canon_ruled, used to fire only when a PR
// changed the canon above, so the card asked for a reply in chat and nothing
// on the dashboard could answer it. The answer can now be stored in
// system_config (one key per site, so two answers never race on one value),
// and the daily check applies it before it reads anything: the site is read
// as if the registry said what the answer says, the rung-4 finding is not
// raised, the detector fires and the action closes like any other.
//
// Code still wins. The stored answer applies only while the registry entry is
// 'ruling_owed'; once a PR writes the ruling into the entry, the stored value
// is ignored rather than fighting it.

/** Every job id, in the order src/content/jobs.ts offers them (a test asserts the set). */
export const WEB_JOBS: readonly WebJob[] = ['fill_pilots', 'keep_honest', 'run_pilots', 'feed_demand', 'keep_edge']

export function isWebJob(v: unknown): v is WebJob {
  return typeof v === 'string' && (WEB_JOBS as readonly string[]).includes(v)
}

/** The system_config key that holds one site's answered ruling. */
export function canonRulingKey(prefix: WebPrefix): string {
  return `web_canon_ruling_${prefix}`
}

/** One answered ruling, as stored (JSON in system_config.value). */
export interface CanonRuling {
  choice: string
  /** Only for an answer that makes the site live without naming its job in the answer itself ('live'). */
  job: WebJob | null
  /** ISO instant it was answered. */
  at: string
}

/** The answers a site's open ruling accepts, in the registry's order; [] when no ruling is owed. */
export function canonChoices(p: WebProperty): string[] {
  return p.canon.status === 'ruling_owed' ? [...p.canon.options] : []
}

/** True for an answer that needs the job it serves named alongside it. */
export function choiceNeedsJob(choice: string): boolean {
  return choice === 'live'
}

/**
 * What an answer means for the site, or null when the site does not accept it.
 *
 *   measure        -> measure_only: keep reading visits, no actions
 *   park, retire   -> retired: only visits are read (taking a tag off the
 *                     page is a change to that site's own repo, not this one)
 *   proof          -> live, feeding demand ("proof (it feeds demand for the
 *                     pilot)" is how the fulltime.fm action words it)
 *   live + job     -> live, serving that job. 'live' alone is not an answer:
 *                     a live site with no job has nothing to grow toward.
 */
export function canonFromChoice(p: WebProperty, choice: string, job?: WebJob | null): { canon: WebCanon; jobs: WebJob[] } | null {
  if (!canonChoices(p).includes(choice)) return null
  switch (choice) {
    case 'measure': return { canon: { status: 'measure_only' }, jobs: [] }
    case 'park':
    case 'retire': return { canon: { status: 'retired' }, jobs: [] }
    case 'proof': return { canon: { status: 'live' }, jobs: ['feed_demand'] }
    case 'live': return isWebJob(job) ? { canon: { status: 'live' }, jobs: [job] } : null
    default: return null
  }
}

/** A stored value (system_config text, or already parsed) as a ruling this site accepts, or null. */
export function parseCanonRuling(p: WebProperty, raw: unknown): CanonRuling | null {
  let v: unknown = raw
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw) } catch { return null }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const choice = typeof o.choice === 'string' ? o.choice.trim() : ''
  const job = isWebJob(o.job) ? o.job : null
  const at = typeof o.at === 'string' && Number.isFinite(Date.parse(o.at)) ? o.at : null
  if (!choice || !at || !canonFromChoice(p, choice, job)) return null
  return { choice, job, at }
}

/** The site as the check should read it: with its answered ruling applied, or unchanged. */
export function withCanonRuling(p: WebProperty, ruling: CanonRuling | null | undefined): WebProperty {
  if (!ruling) return p
  const ruled = canonFromChoice(p, ruling.choice, ruling.job)
  return ruled ? { ...p, canon: ruled.canon, jobs: ruled.jobs } : p
}

// ---------- wire types (the API writes them, the UI reads them) ----------
export type HealthVerdict = 'no_access' | 'api_disabled' | 'wrong_stream' | 'tag_missing' | 'never_received' | 'provisional' | 'quiet' | 'ok'
export type HealthFlag = 'consent_gated' | 'thresholded' | 'admin_unverified' | 'undercounting' | 'host_filter_off' | 'read_failed'
export type FindingClass = 'auto' | 'agent' | 'krish'
export type DetectorKind =
  | 'ga_read_ok' | 'admin_api_ok' | 'stream_match' | 'tag_present' | 'lifetime_hits'
  | 'plausible_ok' | 'plausible_goals' | 'canon_ruled' | 'metric_present' | 'key_events_configured'
  | 'consent_default_denied' | 'substack_new_post' | 'rss_items_up' | 'pilot_state_advanced'
  | 'today_slot_done' | 'condition_cleared'
export interface DetectorSpec { kind: DetectorKind; baseline?: string | number | null }
export interface WebWindow { sessions: number; users: number; newUsers: number; engagedSessions: number; pageviews: number; keyEvents: number; eventCount: number }
export interface WebTotals { cur: WebWindow; prev: WebWindow }
export interface WebRow { name: string; sessions: number }
export interface Finding {
  id: string                        // catalog id (spec section 4)
  prefix: WebPrefix | 'shared'
  cls: FindingClass
  line: string                      // shown verbatim
  job: WebJob
  detector: DetectorSpec
  evidence: Record<string, unknown>
  rung?: 1 | 2 | 3 | 4              // krish ladder findings only
  owner?: 'maya'                    // agent findings only
  routed?: 'touchpoint' | 'unrouted'
}
export interface KrishAction {
  id: string                        // `${prefix}:${findingId}` | `shared:${findingId}` | `${prefix}:growth:${issued_at YYYY-MM-DD}`
  prefix: WebPrefix | 'shared'
  rung: 1 | 2 | 3 | 4 | 5
  kind: 'setup' | 'ruling' | 'data' | 'growth'   // 1-2 setup, 3 data, 4 ruling, 5 growth
  title: string                     // imperative, <= 90 chars; the exact text "Put on today" writes
  why: string                       // <= 240 chars, cites a live number or date
  first_step: string                // <= 240 chars, doable in one sitting
  job: WebJob
  minutes: number                   // his time, 1..120
  link: { label: string; href: string } | null   // href '#/...' = in-app, else external
  detector: DetectorSpec
  issued_at: string                 // ISO; kept while the id is unchanged
  expires_at: string | null         // rung 5 only: issued_at + 14 days
  members: WebPrefix[]              // shared actions: the properties waiting on it; [] otherwise
  hero_line: string | null          // <= 60 chars, rungs 1-2 only
  alternate: { title: string; why: string; job: WebJob } | null   // rung 5 only: the proposalPlay swing
  writer: 'ladder' | 'claude' | 'fallback'
}
export interface WebFixed { id: string; line: string; at: string }
export interface WebClosed { title: string; detector: DetectorKind; how: 'done' | 'expired'; closed_at: string }
export interface WebPropertyView {
  prefix: WebPrefix
  label: string
  venture: string
  goal: string
  canon: WebCanon['status']
  as_of: string | null
  run_at: string | null
  health: HealthVerdict | null      // null only when no row exists yet
  flags: HealthFlag[]
  health_line: string
  property_tz: string | null
  id_source: 'env' | 'default' | 'discovered' | 'none' | null
  totals: WebTotals | null          // null unless health is ok|quiet|provisional AND the read succeeded
  series: Array<{ date: string; sessions: number | null }> | null   // 28 days oldest first; null day = unmeasured
  top: { sources: WebRow[]; pages: WebRow[]; ai: WebRow[]; channels: WebRow[] }
  crosscheck: {
    posthog: { pageviews_7d: number; users_7d: number; date: string } | null
    plausible: { visits_7d: number; visits_prev_7d: number | null; goals: Array<{ name: string; events: number }> | null } | null
  }
  insight: string
  fixed: WebFixed[]                 // last 7 days, newest first, max 5
  closed: WebClosed[]               // last 7 days, newest first
  action: KrishAction | null        // null when waiting on a shared action or nothing is owed
  wait_line: string | null          // shown when action is null
  later: Array<{ id: string; line: string; job: WebJob }>
  drafted: Array<{ id: string; line: string; job: WebJob; routed: 'touchpoint' | 'unrouted' }>
}
export interface WebRunSummary {
  trigger: 'cron' | 'refresh' | 'run'; dry_run: boolean; started_at: string; duration_ms: number
  admin_api: 'ok' | 'disabled' | 'denied' | 'error' | 'skipped'
  properties: Array<{ prefix: WebPrefix; health: HealthVerdict; flags: HealthFlag[]; rung: number | null; action_id: string | null
    llm: 'called' | 'reused' | 'fallback' | 'skipped' | 'failed'; findings: number; fixed: number; touchpoints_written: number
    quota: { consumed: number | null; remaining: number | null } }>
  errors: string[]
}
export interface WebInsightsResponse {
  ok: true
  setup?: 'table_missing'
  generated_at: string
  last_run: { run_at: string; trigger: 'cron' | 'refresh' | 'run'; status: string } | null
  next_run_at: string               // next 13:20 UTC
  can_refresh_at: string | null     // null = may refresh now
  shared_action: KrishAction | null
  properties: WebPropertyView[]     // always 4, in WEB_PROPERTIES order
  run?: WebRunSummary               // POST refresh only
  refreshed?: boolean               // POST refresh only
}

/** Health words: one source for the API insight line and the UI. */
export const HEALTH_LINE: Record<HealthVerdict, string> = {
  no_access: 'Control Center cannot read this property yet.',
  api_disabled: 'Cannot be checked until one Google setting is on.',
  wrong_stream: 'The property id points at a different site.',
  tag_missing: 'The page is not loading its Google tag.',
  never_received: 'The tag is live but Google Analytics has never recorded a visit.',
  provisional: 'First days of data. Numbers settle within 48 hours.',
  quiet: 'Reading fine. Very few visits.',
  ok: 'Reading fine.',
}
export const HEALTH_CHIP: Record<HealthVerdict, string> = {
  no_access: 'Not connected', api_disabled: 'Cannot check', wrong_stream: 'Wrong property', tag_missing: 'Tag missing',
  never_received: 'Nothing received', provisional: 'First days', quiet: 'Measuring, quiet week', ok: 'Measuring',
}
export const FLAG_LINE: Record<HealthFlag, string> = {
  consent_gated: 'Counts only visitors who press Allow.',
  thresholded: 'Google Analytics is hiding some small numbers.',
  admin_unverified: 'Wiring not checked, because the Admin API is off.',
  undercounting: 'Google Analytics sees less than half of what PostHog sees.',
  host_filter_off: 'Visits on other hosts could not be left out.',
  read_failed: 'The last read failed, so this is the verdict before it.',
}
export const DONE_HINT: Record<DetectorKind, string> = {
  ga_read_ok: 'Clears on the next check that can read it.',
  admin_api_ok: 'Clears on the next check after the API is on.',
  stream_match: 'Clears when the property carries the right web stream.',
  tag_present: 'Clears when the page loads its tag again.',
  lifetime_hits: 'Clears when Google records its first visit.',
  plausible_ok: 'Clears when the key is set and Plausible answers.',
  plausible_goals: 'Clears when Plausible has goals set.',
  canon_ruled: 'Clears when the PR with your ruling is merged.',
  metric_present: 'Clears when the subscriber count is imported.',
  key_events_configured: 'Clears when Google Analytics has a key event.',
  consent_default_denied: 'Clears when the site asks before loading Google Analytics.',
  substack_new_post: 'Clears when a new post is live on the newsletter.',
  rss_items_up: 'Clears when the feed carries a new edition.',
  pilot_state_advanced: 'Clears when the approach moves past drafted.',
  today_slot_done: 'Clears when you tick it off on Home.',
  condition_cleared: 'Clears when the next check no longer sees it.',
}
