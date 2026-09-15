import { supabase } from './_supabase.js'
import { logApiCall } from './_alert.js'
import { outcomeFrom, skipped, empty, errored, ok, type ProviderOutcome } from './_quota.js'

// Shared Apify client.
//
// Two call sites hand-rolled this already (_guestSources.ts and
// content-ideas/[id]/challenge.ts) with divergent timeouts, no shared error
// handling, and no metering. This is the third, and it is the shared one: the
// registry lookup, the run, the classification and the ledger write in one
// place. The existing two are left alone deliberately — rewriting a working
// LinkedIn post search is not part of adding a person from a screenshot.
//
// The lesson those two files paid for, preserved here because it is the single
// biggest source of silent failure with Apify:
//
//   Each actor has its OWN input schema and they are NOT interchangeable.
//   Send the wrong keys and the actor runs, parses an empty search, and exits 0
//   with an empty dataset. A broken call and a genuinely empty result are
//   indistinguishable from the status code alone.
//
// So the input is built per-slug by the caller, a zero-item result is reported
// as `empty` with the actor named rather than as success, and every attempt is
// recorded in `tried`.

const APIFY_BASE = 'https://api.apify.com/v2'

export interface ActorAttempt { slug: string; note: string }

export interface ApifyRunResult {
  items: unknown[]
  outcome: ProviderOutcome
  /** Which actor produced `items`, if any. */
  actorUsed: string | null
  /** One line per actor tried, for the degraded note. */
  tried: ActorAttempt[]
}

interface RegistryRow {
  actor_slug: string
  is_primary: boolean | null
  required_input_shape: Record<string, unknown> | null
}

/** Resolve actor slugs for a task category, primary first.
 *
 *  Registry-driven rather than hardcoded so a kill switch on a misbehaving
 *  actor takes effect without a deploy. `killed` rows are excluded. Falls back
 *  to the caller's defaults when the table is unreachable or empty for this
 *  category — the table lives only in the live project and has no migration
 *  here, so it must never be a hard dependency. */
export async function resolveActors(
  taskCategory: string,
  fallbackSlugs: string[],
): Promise<{ slug: string; requiredInputShape: Record<string, unknown> | null }[]> {
  try {
    const { data } = await supabase
      .from('apify_actor_registry')
      .select('actor_slug, is_primary, required_input_shape')
      .eq('task_category', taskCategory)
      .eq('killed', false)
      .order('is_primary', { ascending: false })
    const rows = (data ?? []) as RegistryRow[]
    const resolved = rows
      .filter(r => r.actor_slug)
      .map(r => ({ slug: r.actor_slug, requiredInputShape: r.required_input_shape ?? null }))
    if (resolved.length) return resolved
  } catch { /* fall through to the defaults */ }
  return fallbackSlugs.map(slug => ({ slug, requiredInputShape: null }))
}

export interface RunActorOpts {
  taskCategory: string
  fallbackSlugs: string[]
  /** Per-actor input. Called once per slug because schemas differ. */
  buildInput: (slug: string, requiredInputShape: Record<string, unknown> | null) => Record<string, unknown>
  /** Apify-side timeout in seconds. Keep well under the function's maxDuration. */
  timeoutSec?: number
  maxItems?: number
  /** Hard per-run spend ceiling in USD, forwarded as maxTotalChargeUsd. The
   *  platform aborts the run when the charge reaches it, so a pay-per-event
   *  actor cannot bill past the cap even if maxItems is mis-set. */
  maxTotalChargeUsd?: number
  /** At most this many actors are tried before giving up. */
  maxAttempts?: number
  /** Recorded on the ledger row so spend can be attributed. */
  source?: string
}

/** Run the first actor for a category that returns items.
 *
 *  Never throws. A missing token is `skipped_no_key` (expected, not an alert);
 *  a 402/429 is classified as blocking so the caller can stop rather than
 *  half-enrich; a 2xx with an empty dataset is `empty`. */
export async function runActor(opts: RunActorOpts): Promise<ApifyRunResult> {
  const token = process.env.APIFY_TOKEN
  const tried: ActorAttempt[] = []
  if (!token) {
    return { items: [], outcome: skipped('apify'), actorUsed: null, tried }
  }

  const actors = await resolveActors(opts.taskCategory, opts.fallbackSlugs)
  if (!actors.length) {
    return { items: [], outcome: empty('apify', `no actor registered for ${opts.taskCategory}`), actorUsed: null, tried }
  }

  const timeoutSec = opts.timeoutSec ?? 60
  let lastBlocking: ProviderOutcome | null = null

  for (const { slug, requiredInputShape } of actors.slice(0, opts.maxAttempts ?? 2)) {
    // Apify addresses actors as owner~name in the URL, owner/name everywhere else.
    const actor = slug.replace('/', '~')
    const params = new URLSearchParams({ token, timeout: String(timeoutSec) })
    if (opts.maxItems) params.set('maxItems', String(opts.maxItems))
    if (opts.maxTotalChargeUsd) params.set('maxTotalChargeUsd', String(opts.maxTotalChargeUsd))

    // An AbortController on top of Apify's own timeout: `timeout` bounds the
    // actor run, not the HTTP response, so a stalled connection can still eat
    // the whole function budget.
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), (timeoutSec + 8) * 1000)
    try {
      const r = await fetch(`${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts.buildInput(slug, requiredInputShape)),
        signal: ctrl.signal,
      })
      const text = await r.text()
      if (!r.ok) {
        const outcome = outcomeFrom('apify', r.status, text)
        tried.push({ slug, note: `HTTP ${r.status} (${outcome.status})` })
        // Out of credits or a rejected token will not improve on the fallback
        // actor — the account is the problem, not the actor. Stop immediately
        // so the caller alerts instead of burning a second attempt.
        if (outcome.status === 'exhausted' || outcome.status === 'auth_failed') {
          await logApiCall({ api: 'apify', endpoint: `acts/${slug}`, units: 0, source: opts.source, meta: { blocked: outcome.status } })
          return { items: [], outcome, actorUsed: null, tried }
        }
        if (outcome.status === 'rate_limited') lastBlocking = outcome
        continue
      }

      const items = JSON.parse(text) as unknown
      const list = Array.isArray(items) ? items : []
      tried.push({ slug, note: `${list.length} items` })
      await logApiCall({
        api: 'apify',
        endpoint: `acts/${slug}`,
        units: 1,
        source: opts.source,
        meta: { task_category: opts.taskCategory, items: list.length },
      })
      if (list.length) return { items: list, outcome: ok('apify'), actorUsed: slug, tried }
    } catch (e: unknown) {
      const msg = (e as Error)?.name === 'AbortError'
        ? `timed out after ${timeoutSec + 8}s`
        : String((e as Error)?.message || e).slice(0, 120)
      tried.push({ slug, note: `FAILED ${msg}` })
    } finally {
      clearTimeout(tid)
    }
  }

  if (lastBlocking) return { items: [], outcome: lastBlocking, actorUsed: null, tried }
  // Zero is DEGRADED, never a clean empty: these actors exit 0 with an empty
  // dataset both when the target genuinely has nothing and when the input shape
  // was wrong. Naming the actors and their counts is what separates them.
  return {
    items: [],
    outcome: empty('apify', `${opts.taskCategory}: ran but returned nothing (${tried.map(t => `${t.slug} ${t.note}`).join('; ')})`),
    actorUsed: null,
    tried,
  }
}

// ── LinkedIn profile ────────────────────────────────────────────────────────

export interface LinkedInProfile {
  fullName?: string
  headline?: string
  about?: string
  company?: string
  title?: string
  location?: string
  publicIdentifier?: string
  followerCount?: number
  /** Hub markers. The registered profile actor returns no follower or
   *  connection count at all — confirmed against its own field list on 45
   *  enriched profiles — so these are what stands in for reach. LinkedIn grants
   *  the influencer badge sparingly and the creator flag marks people who
   *  actually publish, which is closer to "is this person a node" than a raw
   *  follower number anyway. */
  isInfluencer?: boolean
  isCreator?: boolean
  recommendationsReceived?: number
  experienceCount?: number
  experience: { title?: string; company?: string; dates?: string }[]
  skills: string[]
  raw: Record<string, unknown>
}

/** Registered primary at time of writing: dev_fusion/linkedin-profile-scraper,
 *  whose `required_input_shape` in the registry is {"profileUrls": []}. */
const PROFILE_FALLBACKS = ['dev_fusion/linkedin-profile-scraper']

/** Counts as actors actually emit them: a number, "12,345", or "1.2K".
 *  Returns undefined rather than 0 for anything unparseable, because a hub
 *  score of zero and "we never learned" are different claims. */
export function parseCount(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : undefined
  if (typeof v !== 'string') return undefined
  const m = v.trim().replace(/,/g, '').match(/^([\d.]+)\s*([KkMm])?/)
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  const mult = m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1
  return Math.round(n * mult)
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return s || undefined
}

/** Scrape one public LinkedIn profile.
 *
 *  Field names vary between profile actors, so every read probes the handful of
 *  spellings the common ones use rather than assuming one shape. */
export async function linkedInProfile(profileUrl: string, source = 'network-add-person'): Promise<{
  profile: LinkedInProfile | null
  outcome: ProviderOutcome
  tried: ActorAttempt[]
}> {
  const run = await runActor({
    taskCategory: 'linkedin_profile_enrich',
    fallbackSlugs: PROFILE_FALLBACKS,
    // Every registered profile actor so far takes a URL list; the registry's
    // required_input_shape names the key, so honour it when present and fall
    // back to the union of the common spellings when it is null.
    buildInput: (_slug, shape) => {
      if (shape && typeof shape === 'object') {
        const key = Object.keys(shape).find(k => /profileurls?|urls?|links?/i.test(k))
        if (key) return { [key]: [profileUrl] }
      }
      return { profileUrls: [profileUrl] }
    },
    timeoutSec: 45,
    maxItems: 1,
    source,
  })

  if (run.outcome.status !== 'ok' || !run.items.length) {
    return { profile: null, outcome: run.outcome, tried: run.tried }
  }

  const d = (run.items[0] || {}) as Record<string, any>
  const exp = Array.isArray(d.experience) ? d.experience : Array.isArray(d.experiences) ? d.experiences : []
  const positions = exp.slice(0, 6).map((e: Record<string, any>) => ({
    title: str(e?.title) || str(e?.position),
    company: str(e?.companyName) || str(e?.company) || str(e?.subtitle),
    dates: str(e?.caption) || str(e?.dateRange) || str(e?.duration),
  })).filter((e: { title?: string; company?: string }) => e.title || e.company)

  const profile: LinkedInProfile = {
    fullName: str(d.fullName) || [str(d.firstName), str(d.lastName)].filter(Boolean).join(' ') || undefined,
    headline: str(d.headline) || str(d.occupation),
    about: str(d.about) || str(d.summary),
    company: str(d.companyName) || str(d.company) || positions[0]?.company,
    title: str(d.jobTitle) || positions[0]?.title,
    location: str(d.addressWithCountry) || str(d.location) || str(d.geoLocationName) || str(d.locationName),
    publicIdentifier: str(d.publicIdentifier) || str(d.username),
    // Followers is the one field here that was read strictly while every other
    // field probed spellings, and it cost us the signal: 22 profiles enriched
    // through this actor, Alexis Ohanian among them, all came back with no
    // follower count at all. Actors return it as "12,345", as "1.2K", and under
    // four different key names. It is the hub term in the ranker, so it is
    // parsed as defensively as everything else on this row.
    followerCount: parseCount(d.followers) ?? parseCount(d.followerCount) ?? parseCount(d.followersCount) ?? parseCount(d.followersCountText),
    isInfluencer: d.isInfluencer === true,
    isCreator: d.isCreator === true,
    recommendationsReceived: parseCount(d.totalRecommendationsReceived),
    experienceCount: parseCount(d.experiencesCount) ?? (positions.length || undefined),
    experience: positions,
    skills: (Array.isArray(d.skills) ? d.skills : [])
      .map((s: unknown) => (typeof s === 'string' ? s : str((s as Record<string, unknown>)?.title)))
      .filter((s: string | undefined): s is string => Boolean(s))
      .slice(0, 12),
    raw: d,
  }

  const anythingUseful = profile.fullName || profile.headline || profile.company || profile.title
  if (!anythingUseful) {
    return { profile: null, outcome: empty('apify', 'profile actor returned a row with no usable fields'), tried: run.tried }
  }
  return { profile, outcome: ok('apify'), tried: run.tried }
}

/** Exported for the error path in callers that want a uniform shape. */
export const apifyError = (detail: string): ProviderOutcome => errored('apify', detail)

// ── LinkedIn posts ──────────────────────────────────────────────────────────

export interface LinkedInPost {
  text?: string | null
  postedAt?: string | null
  url?: string | null
}

/** Registered primary: harvestapi/linkedin-profile-posts, whose
 *  required_input_shape in the registry is {"targetUrls": []}. */
const POSTS_FALLBACKS = ['harvestapi/linkedin-profile-posts']

/** Read a person's recent public posts.
 *
 *  Separate from linkedInProfile because it is a separate paid actor run and
 *  because it is worth doing for far fewer people: what someone published last
 *  month is a reason to message them, and that only matters for people Krish
 *  would actually message. The caller decides who; this just reads.
 *
 *  maxItems is small on purpose. Intent lives in the last handful of posts, and
 *  every extra item is charged for. */
export async function linkedInPosts(profileUrl: string, limit = 10, source = 'network-enrich-person'): Promise<{
  posts: LinkedInPost[]
  outcome: ProviderOutcome
  tried: ActorAttempt[]
}> {
  const run = await runActor({
    taskCategory: 'linkedin_profile_posts',
    fallbackSlugs: POSTS_FALLBACKS,
    buildInput: (_slug, shape) => {
      if (shape && typeof shape === 'object') {
        const key = Object.keys(shape).find(k => /targeturls?|profileurls?|urls?/i.test(k))
        if (key) return { [key]: [profileUrl], maxPosts: limit }
      }
      return { targetUrls: [profileUrl], maxPosts: limit }
    },
    timeoutSec: 45,
    maxItems: limit,
    source,
  })

  if (run.outcome.status !== 'ok') return { posts: [], outcome: run.outcome, tried: run.tried }

  // Post actors disagree about field names as much as profile actors do, and
  // the date matters more here than anywhere else: an undated post cannot be
  // called recent, and recency is the entire value of this signal.
  const posts: LinkedInPost[] = run.items.slice(0, limit).map(raw => {
    const d = (raw || {}) as Record<string, any>
    return {
      text: str(d.text) || str(d.content) || str(d.postText) || str(d.commentary) || null,
      postedAt: str(d.postedAt) || str(d.postedDate) || str(d.publishedAt) || str(d.date)
        || str(d.postedAtISO) || str(d.time) || null,
      url: str(d.url) || str(d.postUrl) || str(d.link) || null,
    }
  }).filter(p => p.text)

  return { posts, outcome: posts.length ? run.outcome : empty('apify', 'posts actor returned no readable posts'), tried: run.tried }
}
