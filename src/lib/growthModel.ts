/**
 * The Growth tab's read model: pure functions over what useGrowth,
 * useWebInsights, useSeoRank and the acquisition overview already return.
 *
 * The tab answers one question, "is anyone finding my products, and what is
 * the one thing to do now to get more people to find them?", so this file
 * turns six tables into four things:
 *
 *   splitReviews   this week's review per product, everything older as history
 *   nextMoves      one ordered queue of things to do, across every source
 *   productSignals per product: AI answers, site visits, Google rank, clips, places
 *   weekLoop       the four steps of the week and where he is in them
 *
 * Every function is deterministic for its inputs (time comes in as `now`,
 * ties break on id) and none of them invents a number: an unmeasured value is
 * null, never 0. No React, no fetch, no locale formatting: the UI formats.
 */
import {
  BATCH_MAX, BATCH_MIN, COUNCIL_RUN_UTC_HOUR, PRODUCTS, asList, growthWeekOf, mondayOfUtc, reviewWeekFor,
  type CouncilReviewRow, type CreativeCardRow, type GeoProbeRow, type SocialAccountRow, type Stage, type TouchpointRow,
} from './growth'
import { canonicalVentureSlug, ventureLabel } from './ventureOptions'
import {
  canonChoices, choiceNeedsJob, webProperty,
  type KrishAction, type WebInsightsResponse, type WebPrefix, type WebPropertyView,
} from './webProperties'
import { CLEARED_OLD_WEEK, type SeoRankRow } from './growthWire'

const DAY_MS = 86_400_000

/** The window every "do AI answers mention you" number uses (the Sunday review and GeoProbes use the same). */
export const AI_WINDOW_DAYS = 30
/** A site action this short sits with the quick choices at the front of the queue. */
export const SHORT_SITE_MINUTES = 30

// ---------- small shared helpers ----------

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : NaN
}

/** How a Today slot text and a title are compared (the same rule as api/_webInsightsCore normaliseSlotText). */
export function normaliseTaskText(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 240)
}

/** The Growth table spelling of a venture (`full-time`) when it is one of the five products, else the registry slug. */
export function growthSlugOf(venture: string | null | undefined): string | null {
  const canonical = canonicalVentureSlug(venture)
  if (!canonical) return null
  return PRODUCTS.find(p => canonicalVentureSlug(p) === canonical) ?? canonical
}

function productOrder(slug: string): number {
  const i = PRODUCTS.indexOf(slug as (typeof PRODUCTS)[number])
  return i < 0 ? PRODUCTS.length : i
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// ---------- 1. the weekly review ----------

/** The newest week_start in the rows, or null when there are none. */
export function latestWeek(reviews: ReadonlyArray<Pick<CouncilReviewRow, 'week_start'>>): string | null {
  let best: string | null = null
  for (const r of reviews) {
    const w = typeof r?.week_start === 'string' ? r.week_start.slice(0, 10) : ''
    if (w && (!best || w > best)) best = w
  }
  return best
}

export interface ReviewSplit {
  /** The newest week_start, or null with no reviews. */
  latest: string | null
  /** One review per product for that week, in the house product order. */
  thisWeek: CouncilReviewRow[]
  /** Everything else, newest week first. History: none of it asks for anything. */
  older: CouncilReviewRow[]
}

/**
 * This week's reviews and the rest. Only the newest week asks him for
 * anything; older weeks are history, whatever their ruling says. A second row
 * for the same product and week (the upsert key should prevent it) keeps the
 * newer created_at and the other goes to `older`.
 */
export function splitReviews(reviews: ReadonlyArray<CouncilReviewRow>): ReviewSplit {
  const latest = latestWeek(reviews)
  const keep = new Map<string, CouncilReviewRow>()
  const older: CouncilReviewRow[] = []
  for (const r of reviews) {
    if (!latest || r.week_start.slice(0, 10) !== latest) { older.push(r); continue }
    const had = keep.get(r.product_slug)
    if (!had) { keep.set(r.product_slug, r); continue }
    const newer = ms(r.created_at) > ms(had.created_at) || (ms(r.created_at) === ms(had.created_at) && r.id > had.id)
    keep.set(r.product_slug, newer ? r : had)
    older.push(newer ? had : r)
  }
  const thisWeek = [...keep.values()].sort((a, b) => productOrder(a.product_slug) - productOrder(b.product_slug) || byId(a, b))
  older.sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0)
    || productOrder(a.product_slug) - productOrder(b.product_slug) || byId(a, b))
  return { latest, thisWeek, older }
}

function findingsOf(r: Pick<CouncilReviewRow, 'findings'>): Record<string, unknown> | null {
  const f = r?.findings
  return f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : null
}

/**
 * True for a "numbers only" review: the writing pass was down, so the row
 * carries a data line where the headline should be and no moves. council-run
 * marks it with findings.degraded; the headline prefix catches a row written
 * before the marker existed.
 */
export function degradedReview(r: Pick<CouncilReviewRow, 'findings'>): boolean {
  const f = findingsOf(r)
  if (!f) return false
  if (typeof f.degraded === 'string' ? f.degraded.trim() !== '' : f.degraded === true) return true
  return typeof f.headline === 'string' && /^evidence-only review:/i.test(f.headline.trim())
}

/** The review's one sentence, or null. Never the pipe-separated data line of a degraded review. */
export function reviewHeadline(r: Pick<CouncilReviewRow, 'findings'>): string | null {
  if (degradedReview(r)) return null
  const h = findingsOf(r)?.headline
  return typeof h === 'string' && h.trim() ? h.trim() : null
}

/** The review's moves ("do next"), [] for a degraded review. */
export function reviewMoves(r: Pick<CouncilReviewRow, 'findings' | 'double_down'>): string[] {
  return degradedReview(r) ? [] : asList(r.double_down).map(s => s.trim()).filter(Boolean)
}

/** True when the row was cleared in bulk as an older week, not judged. */
export function isClearedReview(r: Pick<CouncilReviewRow, 'krish_decision'>): boolean {
  return r.krish_decision === CLEARED_OLD_WEEK
}

/** Every review still unruled in a week older than the newest one: what PATCH { action: 'clear_old' } clears. */
export function oldUnruled(reviews: ReadonlyArray<CouncilReviewRow>): CouncilReviewRow[] {
  const latest = latestWeek(reviews)
  if (!latest) return []
  return reviews.filter(r => !r.krish_decision && r.week_start.slice(0, 10) < latest)
}

export interface MeasuredPart { key: string; label: string; value: string }

/**
 * The council's measured line ("landed 4 this week (...) | signups 0 this
 * week | GEO 0/99 cited | ...", built by measuredLine in council-run.ts) as
 * labelled numbers. A part that says unknown, or that this parser does not
 * recognise, is dropped rather than shown raw: the line is evidence, and an
 * unreadable fragment on screen is worse than a missing one.
 */
export function parseMeasuredLine(line: string | null | undefined): MeasuredPart[] {
  const out: MeasuredPart[] = []
  if (!line || typeof line !== 'string') return out
  const raw = line.replace(/^evidence-only review:\s*/i, '')
  for (const partRaw of raw.split('|')) {
    const part = partRaw.trim()
    let m: RegExpMatchArray | null
    if ((m = part.match(/^landed (\d+) this week/i))) out.push({ key: 'visits', label: 'Visits this week', value: m[1] })
    else if ((m = part.match(/^web (\d+) visits in the 7 days/i))) out.push({ key: 'visits', label: 'Site visits in 7 days', value: m[1] })
    else if ((m = part.match(/^signups (\d+) this week/i))) out.push({ key: 'signups', label: 'Sign-ups this week', value: m[1] })
    else if ((m = part.match(/^GEO (\d+)\/(\d+) cited/i))) out.push({ key: 'ai_answers', label: 'AI answers that name you', value: `${m[1]} of ${m[2]}` })
    else if ((m = part.match(/^AEO (\d+) recommendations?, gap (\S+)/i))) {
      out.push({ key: 'article_ideas', label: 'Article ideas', value: m[1] })
      if (m[2] && m[2] !== 'none') out.push({ key: 'cited_instead', label: 'Cited instead of you', value: m[2] })
    } else if ((m = part.match(/^customers table: paid (\d+), MRR \$([\d.]+), churned (\d+)/i))) {
      out.push({ key: 'paying', label: 'Paying customers', value: m[1] })
      out.push({ key: 'mrr', label: 'MRR', value: `$${m[2]}` })
      out.push({ key: 'churned', label: 'Churned', value: m[3] })
    } else if ((m = part.match(/^touchpoints (\d+)(?: \((.*)\))?/i))) {
      const covered = m[2]?.match(/\bcovered (\d+)/i)?.[1] ?? '0'
      out.push({ key: 'places_covered', label: 'Places covered', value: `${covered} of ${m[1]}` })
    }
  }
  return out
}

/**
 * The readable stand-in for a degraded review's headline: its numbers,
 * labelled, on one line. `line` is null when nothing in it could be read, and
 * then the UI shows nothing at all.
 */
export function degradedSummary(r: Pick<CouncilReviewRow, 'findings'>): { parts: MeasuredPart[]; line: string | null } {
  const f = findingsOf(r)
  const source = typeof f?.measured === 'string' ? f.measured : typeof f?.headline === 'string' ? f.headline : ''
  const parts = parseMeasuredLine(source)
  return { parts, line: parts.length ? parts.map(p => `${p.label}: ${p.value}`).join(' · ') : null }
}

// ---------- 2. the next moves ----------

export type MoveSource = 'site' | 'review' | 'account' | 'clip' | 'place' | 'spend'
/**
 * What pressing an action does. 'answer' posts one of `choices`
 * (useWebInsights().answer); 'today' writes Today's first empty slot
 * (POST /api/daily-focus/slot); 'clip' makes the move a clip
 * (POST /api/growth/creative, batch_week from clipWeekFor); 'suggest' asks for
 * three clip ideas (POST /api/growth/clip-ideas); 'open' follows `link`.
 */
export type MoveActionKind = 'answer' | 'today' | 'clip' | 'suggest' | 'open'
export interface MoveAction { kind: MoveActionKind; label: string }
export interface MoveChoice {
  value: string
  /** The answer as a word ("Proof"). */
  label: string
  /** What it means, from the action's own first step when it says ("it feeds demand for the pilot"), else null. */
  hint: string | null
  /** The answer must name the job the site serves (legibility.io "live"). */
  needsJob: boolean
}

export interface NextMove {
  /** Stable across renders and runs: `site:<action id>`, `review:<week>:<product>:<n>`, `account:<product>:<platform>`, `clip:<card id>`, `clip:pick:<week>`, `spend:<tool>`. */
  id: string
  source: MoveSource
  /** The Growth slug when the venture is one of the five products, else the registry slug; null for a cross-site step. */
  product: string | null
  title: string
  why: string
  /** His time, when the source states it (site actions). Null when nobody measured it. */
  minutes: number | null
  primary: MoveAction
  secondary?: MoveAction
  choices?: MoveChoice[]
  link?: { label: string; href: string }
  /** Site actions: which site (absent for a step shared by several sites). */
  property?: WebPrefix
  /** Review moves: the review it came from. */
  reviewId?: string
  /** Review moves: the week that review covers. Clip steps: the week the clips are for. */
  weekStart?: string
}

/** Pending paid tools, as /api/acquisition/overview `integrations` carries them. */
export interface IntegrationRow { tool: string; status: string; lanes?: string[] | null; monthly_usd?: number | string | null }

export interface NextMovesInput {
  reviews: ReadonlyArray<CouncilReviewRow>
  web?: Pick<WebInsightsResponse, 'properties' | 'shared_action'> | null
  /** product_slug is widened: the accounts table also holds 'publication' (Media). */
  accounts?: ReadonlyArray<Omit<SocialAccountRow, 'product_slug'> & { product_slug: string }>
  touchpoints?: ReadonlyArray<Omit<TouchpointRow, 'product_slug'> & { product_slug: string }>
  cards?: ReadonlyArray<CreativeCardRow>
  integrations?: ReadonlyArray<IntegrationRow> | null
  /** Today's slot texts: anything already on today's list is not offered again. */
  todayTexts?: ReadonlyArray<string | null | undefined>
}

const TODAY: MoveAction = { kind: 'today', label: 'Put on today' }
const CLIPS_LINK = { label: 'Open the clips', href: '#/growth?section=work' }
const MAP_LINK = { label: 'Open the places', href: '#/growth?section=map' }
const INTEL_LINK = { label: 'Open Intel', href: '#/os?sub=intel' }

const PLATFORM_NAME: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', x: 'X', youtube: 'YouTube', substack: 'Substack', linkedin: 'LinkedIn',
}
function platformName(p: string): string {
  return PLATFORM_NAME[p.toLowerCase()] ?? (p ? p[0].toUpperCase() + p.slice(1) : p)
}
/** The map channel an account opens up. */
function channelFor(platform: string): string {
  return platform.toLowerCase() === 'substack' ? 'substack' : 'social_organic'
}

/**
 * The answer chips for a site's open ruling, in the registry's order, with
 * the meaning each answer has in the action's own words when its first step
 * spells them out ("proof (it feeds demand for the pilot), measure (...) or
 * park (...)"). [] when the site owes no ruling.
 */
export function siteChoices(prefix: WebPrefix, firstStep?: string | null): MoveChoice[] {
  const p = webProperty(prefix)
  if (!p) return []
  const hints = new Map<string, string>()
  for (const m of String(firstStep ?? '').matchAll(/\b([a-z]+) \(([^)]+)\)/gi)) hints.set(m[1].toLowerCase(), m[2].trim())
  return canonChoices(p).map(value => ({
    value,
    label: value[0].toUpperCase() + value.slice(1),
    hint: hints.get(value) ?? null,
    needsJob: choiceNeedsJob(value),
  }))
}

/** True once a review move is on today's list or is already a clip for that product. */
export function moveHandled(
  move: string, product: string, cards: ReadonlyArray<CreativeCardRow>, todaySet: ReadonlySet<string>,
): boolean {
  if (todaySet.has(normaliseTaskText(move))) return true
  const shortTitle = move.length > 120 ? `${move.slice(0, 118)}...` : move
  return cards.some(c => c.product_slug === product && c.stage !== 'dropped'
    && (c.title === move || c.title === shortTitle || (typeof c.brief === 'string' && c.brief.endsWith(`: ${move}`))))
}

interface Ranked { tier: number; rank: number; move: NextMove }

function siteItem(a: KrishAction, view: WebPropertyView | null, now: Date): Ranked | null {
  if (a.expires_at && ms(a.expires_at) <= now.getTime()) return null
  const prefix = a.prefix === 'shared' ? null : a.prefix
  const choices = prefix && a.kind === 'ruling' && view?.canon === 'ruling_owed' ? siteChoices(prefix, a.first_step) : []
  const minutes = Number.isFinite(a.minutes) ? a.minutes : null
  const move: NextMove = {
    id: `site:${a.id}`,
    source: 'site',
    product: view ? growthSlugOf(view.venture) : null,
    title: a.title,
    why: a.why,
    minutes,
    primary: choices.length ? { kind: 'answer', label: 'Pick one' } : TODAY,
    ...(choices.length ? { secondary: TODAY, choices } : a.link ? { secondary: { kind: 'open' as const, label: a.link.label } } : {}),
    ...(a.link ? { link: a.link } : {}),
    ...(prefix ? { property: prefix } : {}),
  }
  const tier = choices.length ? 0 : (minutes ?? Infinity) <= SHORT_SITE_MINUTES ? 1 : 3
  return { tier, rank: minutes ?? 999, move }
}

/**
 * One queue of growth moves across every source, best first:
 *
 *   0  quick choices: a site's open ruling, answered with one chip
 *   1  short site steps (30 minutes or less, setup steps included)
 *   2  this week's review moves, first move of every product before second moves
 *   3  longer site steps
 *   4  planned accounts with no handle yet, the one that opens the best-rated places first
 *   5  this week's clips: the ones in progress, then "pick N more" while under 3
 *   6  a paid tool that is not connected: keep it or drop it
 *
 * Ties break on id, so the order never shuffles between renders. Nothing old
 * gets in: review moves come only from the review for the current week
 * (reviewWeekFor(now)), never a degraded one; a site step past its expiry is
 * dropped; clips are this loop week's only. Anything already on today's list,
 * or a move already made into a clip, is not offered again.
 *
 * 'place' is a valid source for the UI to use, but nothing here emits one:
 * the map's open questions are mostly chores waiting on an account, and the
 * account steps carry them.
 */
export function nextMoves(input: NextMovesInput, now: Date): NextMove[] {
  const out: Ranked[] = []
  const todaySet = new Set((input.todayTexts ?? []).map(normaliseTaskText).filter(Boolean))
  const cards = input.cards ?? []

  // Site steps.
  const views = input.web?.properties ?? []
  for (const v of views) {
    if (!v?.action) continue
    const item = siteItem(v.action, v, now)
    if (item) out.push(item)
  }
  if (input.web?.shared_action) {
    const item = siteItem(input.web.shared_action, null, now)
    if (item) out.push(item)
  }

  // This week's review moves.
  const reviewWeek = reviewWeekFor(now)
  const current = splitReviews(input.reviews).thisWeek.filter(r => r.week_start.slice(0, 10) === reviewWeek)
  for (const r of current) {
    const moves = reviewMoves(r)
    const label = ventureLabel(r.product_slug) ?? r.product_slug
    moves.forEach((m, i) => {
      if (moveHandled(m, r.product_slug, cards, todaySet)) return
      out.push({
        tier: 2,
        rank: i * 10 + productOrder(r.product_slug),
        move: {
          id: `review:${reviewWeek}:${r.product_slug}:${i + 1}`,
          source: 'review',
          product: r.product_slug,
          title: m,
          why: reviewHeadline(r) ?? `From this week's review of ${label}.`,
          minutes: null,
          primary: TODAY,
          secondary: { kind: 'clip', label: 'Make it a clip' },
          reviewId: r.id,
          weekStart: r.week_start.slice(0, 10),
        },
      })
    })
  }

  // Planned accounts with no handle.
  const places = (input.touchpoints ?? []).filter(t => t.coverage_status !== 'retired' && t.coverage_status !== 'covered')
  for (const a of input.accounts ?? []) {
    if (a.status !== 'planned' || (a.handle && a.handle.trim())) continue
    const opens = places.filter(t => t.product_slug === a.product_slug && t.channel === channelFor(a.platform))
    const best = opens.reduce((m, t) => Math.max(m, t.cost_efficiency_score ?? 0), 0)
    const label = ventureLabel(a.product_slug) ?? a.product_slug
    const why = opens.length
      ? `It opens up ${opens.length === 1 ? 'a place' : `${opens.length} places`} your buyers already go${best ? `, rated up to ${best} out of 10` : ''}.`
      : 'It is planned and has no account yet.'
    out.push({
      tier: 4,
      rank: -best,
      move: {
        id: `account:${a.product_slug}:${a.platform.toLowerCase()}`,
        source: 'account',
        product: a.product_slug,
        title: `Create the ${label} ${platformName(a.platform)} account`,
        why,
        minutes: null,
        primary: TODAY,
        secondary: { kind: 'open', label: MAP_LINK.label },
        link: MAP_LINK,
      },
    })
  }

  // This week's clips.
  const week = growthWeekOf(now)
  const batch = cards.filter(c => c.batch_week === week && c.stage !== 'dropped')
  for (const c of batch) {
    if (c.stage === 'posted') continue
    out.push({
      tier: 5,
      rank: -STAGE_ORDER.indexOf(c.stage),
      move: {
        id: `clip:${c.id}`,
        source: 'clip',
        product: c.product_slug,
        title: c.title,
        why: `One of this week's clips. It is at the ${STAGE_WORD[c.stage]} step.`,
        minutes: null,
        primary: { kind: 'open', label: 'Open the clip' },
        link: CLIPS_LINK,
        weekStart: week,
      },
    })
  }
  if (batch.length < BATCH_MIN) {
    const need = BATCH_MIN - batch.length
    out.push({
      tier: 5,
      rank: 99,
      move: {
        id: `clip:pick:${week}`,
        source: 'clip',
        product: null,
        title: batch.length === 0 ? `Pick this week's ${BATCH_MIN} clips` : `Pick ${need} more clip${need === 1 ? '' : 's'} for this week`,
        why: `${batch.length} of the ${BATCH_MIN} to ${BATCH_MAX} clips for this week ${batch.length === 1 ? 'is' : 'are'} picked.`,
        minutes: null,
        primary: { kind: 'suggest', label: 'Suggest 3 ideas' },
        secondary: { kind: 'open', label: CLIPS_LINK.label },
        link: CLIPS_LINK,
        weekStart: week,
      },
    })
  }

  // A paid tool that is not connected.
  for (const t of input.integrations ?? []) {
    const usd = Number(t?.monthly_usd)
    if (!t || t.status !== 'pending' || !(usd > 0)) continue
    const lanes = (t.lanes ?? []).filter(Boolean)
    const names = lanes.map(l => ventureLabel(l) ?? l)
    out.push({
      tier: 6,
      rank: -usd,
      move: {
        id: `spend:${t.tool.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        source: 'spend',
        product: lanes.length ? growthSlugOf(lanes[0]) : null,
        title: `Keep or drop ${t.tool}`,
        why: `It costs $${Math.round(usd * 100) / 100} a month${names.length ? ` against ${names.join(' and ')}` : ''} and is not connected.`,
        minutes: null,
        primary: TODAY,
        secondary: { kind: 'open', label: INTEL_LINK.label },
        link: INTEL_LINK,
      },
    })
  }

  return out
    .filter(r => !todaySet.has(normaliseTaskText(r.move.title)))
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank || byId(a.move, b.move))
    .map(r => r.move)
}

const STAGE_ORDER: Stage[] = ['brief', 'script', 'producing', 'produced', 'posted', 'dropped']
const STAGE_WORD: Record<Stage, string> = {
  brief: 'idea', script: 'script', producing: 'filming', produced: 'ready to post', posted: 'posted', dropped: 'dropped',
}

// ---------- 3. per-product signals ----------

export interface AiAnswers {
  mentioned: number
  asked: number
  /** mentioned / asked over the last 30 days; null when nothing was asked. */
  rate: number | null
  trend: {
    /** The newest probe week against the one before it; null with fewer than two weeks. */
    dir: 'up' | 'down' | 'flat' | null
    /** Rate change, newest week minus the week before (0.05 = five points). */
    delta: number | null
    /** One entry per UTC week that had probes, oldest first, for a sparkline. */
    weekly: Array<{ week: string; mentioned: number; asked: number }>
  }
}

export interface ProductSignal {
  /** The Growth slug when one of the five products, else the registry slug. */
  slug: string
  /** The registry slug, for matching across tables. */
  venture: string
  label: string
  /** One of the five products the weekly review covers. */
  core: boolean
  aiAnswers: AiAnswers
  /** Site visits this week and the week before, summed over the sites this venture owns; null when no site of it is measured. */
  visits: { cur: number; prev: number } | null
  /** Google rank from the weekly check; null when it tracks no keyword for this venture. */
  rank: { inTop10: number; tracked: number; best: number | null } | null
  /** This loop week's clips: picked (not dropped) and posted. */
  clips: { made: number; posted: number }
  /** The map: places not retired, how many covered, how many waiting on an open question. */
  places: { covered: number; total: number; waiting: number }
}

export interface SignalsTotals {
  aiAnswers: { mentioned: number; asked: number; rate: number | null }
  visits: { cur: number; prev: number } | null
  rank: { inTop10: number; tracked: number } | null
  clips: { made: number; posted: number; min: number; max: number }
  places: { covered: number; total: number; waiting: number }
  /** The sites AI answers cite most in place of yours, last 30 days. */
  citedInstead: Array<{ domain: string; times: number }>
}

export interface SignalsInput {
  probes?: ReadonlyArray<GeoProbeRow>
  web?: Pick<WebInsightsResponse, 'properties'> | null
  seo?: ReadonlyArray<SeoRankRow> | null
  cards?: ReadonlyArray<CreativeCardRow>
  touchpoints?: ReadonlyArray<Omit<TouchpointRow, 'product_slug'> & { product_slug: string }>
}

/** A venture probe row inside the window, keyed to its product. Prospect and aspiration rows are someone else's answers. */
function ventureProbesInWindow(probes: ReadonlyArray<GeoProbeRow>, now: Date): GeoProbeRow[] {
  const since = now.getTime() - AI_WINDOW_DAYS * DAY_MS
  return probes.filter(p => {
    const t = ms(p.run_at)
    return Number.isFinite(t) && t >= since && t <= now.getTime() + DAY_MS
      && (p.subject_kind == null || p.subject_kind === 'venture')
  })
}

function hostOf(s: string): string {
  try { return new URL(s).hostname.replace(/^www\./, '') } catch { return s.replace(/^www\./, '') }
}

/** The domains cited instead of yours, counted once per answer, most first, ties by name. */
export function citedInstead(probes: ReadonlyArray<GeoProbeRow>, n = 3): Array<{ domain: string; times: number }> {
  const tally = new Map<string, number>()
  for (const p of probes) {
    for (const h of new Set(asList(p.competitors_cited).map(hostOf).filter(Boolean))) tally.set(h, (tally.get(h) ?? 0) + 1)
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([domain, times]) => ({ domain, times }))
}

function aiAnswersFor(rows: GeoProbeRow[]): AiAnswers {
  const mentioned = rows.filter(r => r.we_cited).length
  const byWeek = new Map<string, { mentioned: number; asked: number }>()
  for (const r of rows) {
    const w = mondayOfUtc(new Date(ms(r.run_at)))
    const cur = byWeek.get(w) ?? { mentioned: 0, asked: 0 }
    cur.asked += 1
    if (r.we_cited) cur.mentioned += 1
    byWeek.set(w, cur)
  }
  const weekly = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, v]) => ({ week, ...v }))
  let dir: AiAnswers['trend']['dir'] = null
  let delta: number | null = null
  if (weekly.length >= 2) {
    const last = weekly[weekly.length - 1]
    const before = weekly[weekly.length - 2]
    delta = last.mentioned / last.asked - before.mentioned / before.asked
    dir = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down'
  }
  return { mentioned, asked: rows.length, rate: rows.length ? mentioned / rows.length : null, trend: { dir, delta, weekly } }
}

/** The questions where a product was not named in the last 30 days, one per question, newest first. The evidence behind a low rate. */
export function missedQuestions(
  probes: ReadonlyArray<GeoProbeRow>, product: string, now: Date,
): Array<{ question: string; engines: string[]; lastAsked: string }> {
  const want = canonicalVentureSlug(product)
  const byQ = new Map<string, { question: string; engines: Set<string>; lastAsked: string; mentioned: boolean }>()
  for (const p of ventureProbesInWindow(probes, now)) {
    if (canonicalVentureSlug(String(p.product_slug)) !== want) continue
    const key = normaliseTaskText(p.question)
    const had = byQ.get(key) ?? { question: p.question.trim(), engines: new Set<string>(), lastAsked: p.run_at, mentioned: false }
    if (p.we_cited) had.mentioned = true
    else had.engines.add(p.engine)
    if (ms(p.run_at) > ms(had.lastAsked)) had.lastAsked = p.run_at
    byQ.set(key, had)
  }
  return [...byQ.values()]
    .filter(q => q.engines.size > 0)
    .sort((a, b) => ms(b.lastAsked) - ms(a.lastAsked) || a.question.localeCompare(b.question))
    .map(q => ({ question: q.question, engines: [...q.engines].sort(), lastAsked: q.lastAsked }))
}

/**
 * The per-product read: the five products the review covers, in house order,
 * then any other venture a site or the rank check reports on (the newsletter
 * is Media; legibility.io), by name. A product with no site has visits null
 * and one with no tracked keyword has rank null: no number is made up.
 */
export function productSignals(input: SignalsInput, now: Date): { products: ProductSignal[]; totals: SignalsTotals } {
  const probes = ventureProbesInWindow(input.probes ?? [], now)
  const views = input.web?.properties ?? []
  const seo = input.seo ?? []
  const week = growthWeekOf(now)
  const cards = (input.cards ?? []).filter(c => c.batch_week === week && c.stage !== 'dropped')
  const touchpoints = (input.touchpoints ?? []).filter(t => t.coverage_status !== 'retired')

  const ventures: string[] = PRODUCTS.map(p => canonicalVentureSlug(p))
  // Built before `extras` is filled, so `core` below is the five products only.
  const extras = new Set<string>()
  for (const v of views) { const c = canonicalVentureSlug(v.venture); if (c && !ventures.includes(c)) extras.add(c) }
  for (const r of seo) { const c = canonicalVentureSlug(r.product); if (c && !ventures.includes(c)) extras.add(c) }
  const extraList = [...extras].sort((a, b) => String(ventureLabel(a)).localeCompare(String(ventureLabel(b))) || a.localeCompare(b))

  const products: ProductSignal[] = [...ventures, ...extraList].map(venture => {
    const slug = growthSlugOf(venture) as string
    const same = (s: string | null | undefined) => canonicalVentureSlug(s) === venture
    const mine = views.filter(v => same(v.venture))
    const measured = mine.filter(v => v.totals)
    const ranks = seo.filter(r => same(r.product))
    const positions = ranks.map(r => r.position).filter((p): p is number => p != null)
    const tps = touchpoints.filter(t => same(t.product_slug))
    const clips = cards.filter(c => same(c.product_slug))
    return {
      slug,
      venture,
      label: ventureLabel(venture) ?? venture,
      core: ventures.includes(venture),
      aiAnswers: aiAnswersFor(probes.filter(p => same(String(p.product_slug)))),
      visits: measured.length
        ? { cur: measured.reduce((s, v) => s + (v.totals?.cur.sessions ?? 0), 0), prev: measured.reduce((s, v) => s + (v.totals?.prev.sessions ?? 0), 0) }
        : null,
      rank: ranks.length ? { inTop10: positions.filter(p => p <= 10).length, tracked: ranks.length, best: positions.length ? Math.min(...positions) : null } : null,
      clips: { made: clips.length, posted: clips.filter(c => c.stage === 'posted').length },
      places: {
        covered: tps.filter(t => t.coverage_status === 'covered').length,
        total: tps.length,
        waiting: tps.filter(t => t.assumption_flag && t.assumption_flag.trim()).length,
      },
    }
  })

  const sum = (f: (p: ProductSignal) => number) => products.reduce((s, p) => s + f(p), 0)
  const withVisits = products.filter(p => p.visits)
  const withRank = products.filter(p => p.rank)
  // Totals count every venture probe in the window, including a product slug
  // outside the list above, so the headline rate matches GeoProbes.
  const mentioned = probes.filter(p => p.we_cited).length
  const totals: SignalsTotals = {
    aiAnswers: { mentioned, asked: probes.length, rate: probes.length ? mentioned / probes.length : null },
    visits: withVisits.length ? { cur: withVisits.reduce((s, p) => s + p.visits!.cur, 0), prev: withVisits.reduce((s, p) => s + p.visits!.prev, 0) } : null,
    rank: withRank.length ? { inTop10: withRank.reduce((s, p) => s + p.rank!.inTop10, 0), tracked: withRank.reduce((s, p) => s + p.rank!.tracked, 0) } : null,
    clips: { made: sum(p => p.clips.made), posted: sum(p => p.clips.posted), min: BATCH_MIN, max: BATCH_MAX },
    places: { covered: sum(p => p.places.covered), total: sum(p => p.places.total), waiting: sum(p => p.places.waiting) },
    citedInstead: citedInstead(probes, 3),
  }
  return { products, totals }
}

// ---------- 4. the week ----------

export type LoopStepId = 'review' | 'pick' | 'make' | 'see'
export type LoopStatus = 'done' | 'current' | 'upcoming'
export interface LoopStep {
  id: LoopStepId
  label: string
  status: LoopStatus
  counts: Record<string, number | null>
  action: MoveAction & { link: { label: string; href: string } }
  /** One plain line when the step needs one (no review this week), else null. */
  note: string | null
}

/** The hour after the Sunday run starts, when a missing review is late rather than absent (council-run's budget is 300 s). */
function writingNow(now: Date): boolean {
  return now.getUTCDay() === 0 && now.getUTCHours() === COUNCIL_RUN_UTC_HOUR
}

export interface WeekLoopInput {
  reviews: ReadonlyArray<CouncilReviewRow>
  cards?: ReadonlyArray<CreativeCardRow>
  probes?: ReadonlyArray<GeoProbeRow>
  web?: Pick<WebInsightsResponse, 'properties'> | null
  todayTexts?: ReadonlyArray<string | null | undefined>
}

/**
 * The week in four steps: read the review, pick the clips, make and post
 * them, see what moved. The first step not done is current, the ones before
 * it done, the ones after upcoming. The week is the loop week (growthWeekOf):
 * it turns over when Sunday's review lands, 17:00 UTC.
 *
 *   review  done once there is nothing left to act on in this week's review:
 *           every move is on today or a clip, every review carries a ruling,
 *           the week already has 3 clips, or the review has no moves. A week
 *           with no review at all is not held hostage by it: the step is done
 *           with a note saying none was written.
 *   pick    done at 3 clips picked for the week (5 is the most).
 *   make    done when every picked clip is posted (and at least 3 were).
 *   see     never done: it is where the week ends up.
 */
export function weekLoop(input: WeekLoopInput, now: Date): { week: string; reviewWeek: string; steps: LoopStep[] } {
  const week = growthWeekOf(now)
  const reviewWeek = reviewWeekFor(now)
  const cards = input.cards ?? []
  const todaySet = new Set((input.todayTexts ?? []).map(normaliseTaskText).filter(Boolean))
  const current = splitReviews(input.reviews).thisWeek.filter(r => r.week_start.slice(0, 10) === reviewWeek)
  const moves = current.flatMap(r => reviewMoves(r).map(m => ({ m, product: r.product_slug })))
  const handled = moves.filter(x => moveHandled(x.m, x.product, cards, todaySet)).length
  const batch = cards.filter(c => c.batch_week === week && c.stage !== 'dropped')
  const posted = batch.filter(c => c.stage === 'posted').length
  const inProgress = batch.filter(c => c.stage === 'script' || c.stage === 'producing' || c.stage === 'produced').length

  const recent = ventureProbesInWindow(input.probes ?? [], now).filter(p => ms(p.run_at) >= now.getTime() - 7 * DAY_MS)
  const measured = (input.web?.properties ?? []).filter(v => v.totals)

  const reviewDone = current.length === 0 || moves.length === 0 || handled === moves.length
    || current.every(r => !!r.krish_decision) || batch.length >= BATCH_MIN
  const pickDone = batch.length >= BATCH_MIN
  const makeDone = batch.length >= BATCH_MIN && posted >= batch.length
  const done: Record<LoopStepId, boolean> = { review: reviewDone, pick: pickDone, make: makeDone, see: false }

  // Each rule above implies the ones before it (3 clips picked clears the
  // review; posting needs 3 picked), so "done" is always a prefix.
  const order: LoopStepId[] = ['review', 'pick', 'make', 'see']
  const open = order.findIndex(id => !done[id])
  const status = (id: LoopStepId): LoopStatus => {
    const i = order.indexOf(id)
    return i < open ? 'done' : i === open ? 'current' : 'upcoming'
  }

  const steps: LoopStep[] = [
    {
      id: 'review',
      label: 'Read the review',
      status: status('review'),
      counts: { reviews: current.length, moves: moves.length, handled },
      action: { kind: 'open', label: 'Read the review', link: { label: 'Read the review', href: '#/growth?section=council' } },
      note: current.length === 0
        ? (writingNow(now) ? 'This week\'s review is being written now.' : 'No review was written for this week.')
        : null,
    },
    {
      id: 'pick',
      label: 'Pick clips',
      status: status('pick'),
      counts: { picked: batch.length, min: BATCH_MIN, max: BATCH_MAX },
      action: batch.length === 0
        ? { kind: 'suggest', label: 'Suggest 3 ideas', link: CLIPS_LINK }
        : { kind: 'open', label: CLIPS_LINK.label, link: CLIPS_LINK },
      note: batch.length > BATCH_MAX ? `More than ${BATCH_MAX} clips are picked. Drop one.` : null,
    },
    {
      id: 'make',
      label: 'Make and post',
      status: status('make'),
      counts: { posted, picked: batch.length, inProgress },
      action: { kind: 'open', label: CLIPS_LINK.label, link: CLIPS_LINK },
      note: null,
    },
    {
      id: 'see',
      label: 'See what moved',
      status: status('see'),
      counts: {
        answersMentioned: recent.filter(p => p.we_cited).length,
        answersAsked: recent.length,
        visitsCur: measured.length ? measured.reduce((s, v) => s + (v.totals?.cur.sessions ?? 0), 0) : null,
        visitsPrev: measured.length ? measured.reduce((s, v) => s + (v.totals?.prev.sessions ?? 0), 0) : null,
      },
      action: { kind: 'open', label: 'See what moved', link: { label: 'See what moved', href: '#/growth?section=signals' } },
      note: null,
    },
  ]
  return { week, reviewWeek, steps }
}
