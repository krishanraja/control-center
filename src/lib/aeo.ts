import { PRODUCT_LABEL, dayLabel, type Engine, type GeoProbeRow, type ProductSlug } from './growth'

/**
 * The AEO research machine, the pure half the Growth tab renders from.
 *
 * krishanraja/AEO-Engine runs every Sunday and lands one digest per subject
 * per week (growth_aeo_digests), the scored queries (growth_aeo_queries) and
 * every engine answer (growth_geo_probes). This file turns those rows into
 * the sentences and movements the Signals section shows: what share of
 * answers mentioned you, what changed since last week, and the one line per
 * subject. Nothing here is stored; every number is computed from rows on
 * every render, so it can never drift from the evidence underneath it.
 *
 * scripts/check-aeo-read.mts holds these functions to fixtures without a
 * browser, so a sentence cannot silently start lying.
 */

export type SubjectKind = 'venture' | 'prospect' | 'aspiration'
export type ThemesStatus = 'ok' | 'no_calls' | 'no_attributed_calls' | 'fireflies_unavailable' | 'not_applicable'
export type QueryStatus = 'watch' | 'recommend' | 'drop'
export type Trend = 'new' | 'up' | 'flat' | 'down'

export interface AeoSubjectRow {
  id: string
  kind: SubjectKind
  slug: string
  name: string
  domains: string[]
  competitor_domains: string[]
  icp_line: string | null
  seed_topics: string[]
  never_say: string[]
  product_slug: ProductSlug | null
  room_target_id: string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AeoRecommendation {
  n: number
  title: string
  target_query: string
  query_id: string
  angle: string
  evidence: string[]
  engines: Engine[]
  demand: number
  /** What you have that the sites cited today structurally cannot have. Null
   *  when the machine could not name one, which the card says in words rather
   *  than implying there was a reason. */
  why_you_can_win?: string | null
  content_idea_id?: string | null
  dismissed_at?: string | null
}

/** A question probed and scored that is not worth trying to win. */
export interface AeoNotWorthChasing {
  query_id: string
  query: string
  owned_by: string[]
  why_not: string
}

export interface AeoTheme { theme: string; calls: number; evidence: Array<{ call_ref: string; date: string; paraphrase: string }> }

export interface AeoDigestRow {
  id: string
  run_id: string
  subject_id: string
  week_start: string
  themes: unknown
  themes_status: ThemesStatus
  strongest_signal: string | null
  recommendations: unknown
  watch_list: unknown
  not_worth_chasing: unknown
  competitor_gap: unknown
  playbook: unknown
  approach_hook: string | null
  stats: unknown
  created_at: string
  updated_at: string
}

export interface AeoQueryRow {
  id: string
  run_id: string
  query_id: string
  subject_id: string
  week_start: string
  query: string
  source: 'transcript' | 'gap' | 'seed' | 'striking_distance' | 'watch_carry' | 'room_signal'
  demand_score: number
  demand_basis: unknown
  call_evidence: unknown
  gap: unknown
  trend: Trend | null
  status: QueryStatus
  touchpoint_id: string | null
  created_at: string
}

export interface AeoCommandRow {
  id: number
  subject_id: string | null
  state: 'queued' | 'running' | 'done' | 'failed' | 'superseded'
  requested_at: string
  started_at: string | null
  finished_at: string | null
  result: string | null
  error: string | null
}

export const KIND_ORDER: SubjectKind[] = ['venture', 'prospect', 'aspiration']

export const KIND_LABEL: Record<SubjectKind, string> = {
  venture: 'Your ventures',
  prospect: 'Companies you want to sell to',
  aspiration: 'Companies you want to be like',
}

/** What "themes from calls" says when there are none, in words. */
export const THEMES_STATUS_LINE: Record<Exclude<ThemesStatus, 'ok'>, string> = {
  no_calls: 'No customer calls were recorded in the last 7 days, so there are no themes this week.',
  no_attributed_calls: 'Calls were recorded in the last 7 days, but none was about this subject.',
  fireflies_unavailable: 'The call transcripts could not be read this week. That is a fault in the machine, not a quiet week.',
  not_applicable: 'Themes from calls do not apply to a company you want to be like.',
}

export const SOURCE_LABEL: Record<AeoQueryRow['source'], string> = {
  transcript: 'from a call',
  gap: 'competitor gap',
  seed: 'seed topic',
  striking_distance: 'Google keyword',
  watch_carry: 'carried from last week',
  room_signal: 'from the Room',
}

/** The window the Sunday review uses, so the two never disagree. */
export const WINDOW_DAYS = 30

// ── Coercion of jsonb columns ────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function recommendationsOf(d: AeoDigestRow | null | undefined): AeoRecommendation[] {
  if (!d || !Array.isArray(d.recommendations)) return []
  return (d.recommendations as unknown[]).filter(isObj).map(r => ({
    n: Number(r.n) || 0,
    title: String(r.title || ''),
    target_query: String(r.target_query || ''),
    query_id: String(r.query_id || ''),
    angle: String(r.angle || ''),
    evidence: Array.isArray(r.evidence) ? (r.evidence as unknown[]).map(String) : [],
    engines: Array.isArray(r.engines) ? (r.engines as Engine[]) : [],
    demand: Number(r.demand) || 0,
    why_you_can_win: typeof r.why_you_can_win === 'string' && r.why_you_can_win.trim() ? r.why_you_can_win : null,
    content_idea_id: typeof r.content_idea_id === 'string' ? r.content_idea_id : null,
    dismissed_at: typeof r.dismissed_at === 'string' ? r.dismissed_at : null,
  })).filter(r => r.title)
}

export function undismissed(d: AeoDigestRow | null | undefined): AeoRecommendation[] {
  return recommendationsOf(d).filter(r => !r.dismissed_at)
}

export function themesOf(d: AeoDigestRow | null | undefined): AeoTheme[] {
  if (!d || !Array.isArray(d.themes)) return []
  return (d.themes as unknown[]).filter(isObj).map(t => ({
    theme: String(t.theme || ''),
    calls: Number(t.calls) || 0,
    evidence: Array.isArray(t.evidence) ? (t.evidence as unknown[]).filter(isObj).map(e => ({
      call_ref: String(e.call_ref || ''), date: String(e.date || ''), paraphrase: String(e.paraphrase || ''),
    })) : [],
  })).filter(t => t.theme)
}

export function gapOf(d: AeoDigestRow | null | undefined): { domain: string | null; times_cited: number; questions: string[] } {
  const g = d && isObj(d.competitor_gap) ? d.competitor_gap : {}
  return {
    domain: typeof g.domain === 'string' && g.domain ? g.domain : null,
    times_cited: Number(g.times_cited) || 0,
    questions: Array.isArray(g.questions) ? (g.questions as unknown[]).map(String) : [],
  }
}

export function watchListOf(d: AeoDigestRow | null | undefined): Array<{ query_id: string; query: string; why: string }> {
  if (!d || !Array.isArray(d.watch_list)) return []
  return (d.watch_list as unknown[]).filter(isObj).map(w => ({ query_id: String(w.query_id || ''), query: String(w.query || ''), why: String(w.why || '') })).filter(w => w.query)
}

/** What not to chase, and who owns it. Empty until the engine has judged. */
export function notWorthChasingOf(d: AeoDigestRow | null | undefined): AeoNotWorthChasing[] {
  if (!d || !Array.isArray(d.not_worth_chasing)) return []
  return (d.not_worth_chasing as unknown[]).filter(isObj).map(w => ({
    query_id: String(w.query_id || ''),
    query: String(w.query || ''),
    owned_by: Array.isArray(w.owned_by) ? (w.owned_by as unknown[]).map(String) : [],
    why_not: String(w.why_not || ''),
  })).filter(w => w.query)
}

export function playbookOf(d: AeoDigestRow | null | undefined): Array<{ url: string; host: string; path_pattern: string; times_cited: number; why: string }> {
  if (!d || !Array.isArray(d.playbook)) return []
  return (d.playbook as unknown[]).filter(isObj).map(p => ({
    url: String(p.url || ''), host: String(p.host || ''), path_pattern: String(p.path_pattern || ''), times_cited: Number(p.times_cited) || 0, why: String(p.why || ''),
  }))
}

export function statsOf(d: AeoDigestRow | null | undefined): { queries: number; probes: number; cost_usd: number; engines: number; generated_at: string | null; digest_writer: string | null } {
  const s = d && isObj(d.stats) ? d.stats : {}
  return {
    queries: Number(s.queries) || 0,
    probes: Number(s.probes) || 0,
    cost_usd: Number(s.cost_usd) || 0,
    engines: Number(s.engines) || 0,
    generated_at: typeof s.generated_at === 'string' ? s.generated_at : null,
    digest_writer: typeof s.digest_writer === 'string' ? s.digest_writer : null,
  }
}

// ── Latest and prior per subject ─────────────────────────────────────────────

/** The newest digest per subject, and the one before it. */
export function digestsBySubject(digests: AeoDigestRow[]): Map<string, { latest: AeoDigestRow; prior: AeoDigestRow | null }> {
  const sorted = [...digests].sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0))
  const out = new Map<string, { latest: AeoDigestRow; prior: AeoDigestRow | null }>()
  for (const d of sorted) {
    const cur = out.get(d.subject_id)
    if (!cur) out.set(d.subject_id, { latest: d, prior: null })
    else if (!cur.prior && d.week_start < cur.latest.week_start) cur.prior = d
  }
  return out
}

/** The queries of one subject for one week. */
export function queriesFor(queries: AeoQueryRow[], subjectId: string, weekStart: string): AeoQueryRow[] {
  return queries.filter(q => q.subject_id === subjectId && q.week_start === weekStart).sort((a, b) => b.demand_score - a.demand_score)
}

// ── Hosts and the citation read (moved from GeoProbes) ───────────────────────

/** A URL reduced to the host that answers "who got cited instead of us". */
export function hostLabel(s: string): string {
  try {
    return new URL(s).hostname.replace(/^www\./, '')
  } catch {
    return s
  }
}

function citationsOf(p: GeoProbeRow): string[] {
  const v = p.competitors_cited
  if (!Array.isArray(v)) return []
  return v.map(x => (typeof x === 'string' ? x : isObj(x) && typeof x.url === 'string' ? x.url : '')).filter(Boolean)
}

/** Who gets cited instead, by host, most often first. */
export function topHosts(rows: GeoProbeRow[], n: number): Array<{ host: string; times: number }> {
  const tally = new Map<string, number>()
  for (const p of rows) {
    for (const h of new Set(citationsOf(p).map(hostLabel))) tally.set(h, (tally.get(h) || 0) + 1)
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([host, times]) => ({ host, times }))
}

export function readLine(cited: number, total: number, engines: number, lastRun: string, windowDays = WINDOW_DAYS): string {
  const q = `${total} question${total === 1 ? '' : 's'}`
  const e = `${engines} engine${engines === 1 ? '' : 's'}`
  const when = lastRun ? ` Last asked ${lastRun}.` : ''
  if (cited === 0) return `Asked ${q} across ${e} in the last ${windowDays} days. Not one answer mentioned you.${when}`
  if (cited === total) return `Asked ${q} across ${e} in the last ${windowDays} days. Every answer mentioned you.${when}`
  return `Asked ${q} across ${e} in the last ${windowDays} days. ${cited} answer${cited === 1 ? '' : 's'} mentioned you.${when}`
}

export function kindOfProbe(p: GeoProbeRow): SubjectKind {
  const k = (p as { subject_kind?: string }).subject_kind
  return k === 'prospect' || k === 'aspiration' ? k : 'venture'
}

/** Share of answers that mentioned you, over a window of probes. */
export function share(rows: GeoProbeRow[]): { cited: number; total: number; rate: number | null } {
  const cited = rows.filter(r => r.we_cited).length
  return { cited, total: rows.length, rate: rows.length ? cited / rows.length : null }
}

/** ISO Monday (UTC) that owns a timestamp. */
export function weekOfTs(ts: string): string {
  const d = new Date(ts)
  const day = d.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10)
}

/** The last N weeks of citation share, oldest first, one entry per week even when empty. */
export function weekShares(rows: GeoProbeRow[], weeks: number, now: Date = new Date()): Array<{ week_start: string; cited: number; total: number; rate: number | null }> {
  const thisMonday = weekOfTs(now.toISOString())
  const out: Array<{ week_start: string; cited: number; total: number; rate: number | null }> = []
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(Date.parse(`${thisMonday}T00:00:00Z`) - i * 7 * 86_400_000).toISOString().slice(0, 10)
    const inWeek = rows.filter(r => weekOfTs(r.run_at) === ws)
    out.push({ week_start: ws, ...share(inWeek) })
  }
  return out
}

// ── Movements: what changed since last week ──────────────────────────────────

export type MovementKind = 'first_citation' | 'query_up' | 'query_down' | 'new_competitor' | 'new_theme'

export interface Movement {
  id: string
  kind: MovementKind
  subject_id: string
  week_start: string
  line: string
  /** The recommendation or query the one action targets, when there is one. */
  query_id?: string
  rec_n?: number
}

const TIER = (score: number) => (score >= 75 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0)
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function subjectLabel(s: AeoSubjectRow | undefined, fallback = 'a subject'): string {
  if (!s) return fallback
  return s.kind === 'venture' && s.product_slug ? PRODUCT_LABEL[s.product_slug] || s.name : s.name
}

/**
 * What moved since last week, largest first. Each line is a sentence with the
 * measured before and after in it, never an adjective. Nothing here on the
 * first ever run: the caller says so in words.
 */
export function movements(input: {
  subjects: AeoSubjectRow[]
  digests: AeoDigestRow[]
  queries: AeoQueryRow[]
  probes: GeoProbeRow[]
}): Movement[] {
  const bySubject = digestsBySubject(input.digests)
  const subjectOf = new Map(input.subjects.map(s => [s.id, s]))
  const out: Movement[] = []

  for (const [subjectId, { latest, prior }] of bySubject) {
    const s = subjectOf.get(subjectId)
    const name = subjectLabel(s)
    const mine = input.probes.filter(p => (p as { subject_id?: string | null }).subject_id === subjectId || (!(p as { subject_id?: string | null }).subject_id && s?.product_slug && p.product_slug === s.product_slug))

    // First-ever citation: a hit this week, none in any earlier week.
    const thisWeek = mine.filter(p => weekOfTs(p.run_at) === latest.week_start)
    const earlier = mine.filter(p => weekOfTs(p.run_at) < latest.week_start)
    const hit = thisWeek.find(p => p.we_cited)
    if (hit && earlier.length && !earlier.some(p => p.we_cited)) {
      out.push({
        id: `first:${subjectId}`, kind: 'first_citation', subject_id: subjectId, week_start: latest.week_start,
        line: `First time an engine mentioned ${name}, on "${hit.question}" (${hit.engine}).`,
        query_id: (hit as { query_id?: string | null }).query_id || undefined,
      })
    }

    if (!prior) continue

    // A query that moved two tiers.
    const now = queriesFor(input.queries, subjectId, latest.week_start)
    const before = new Map(queriesFor(input.queries, subjectId, prior.week_start).map(q => [q.query_id, q]))
    for (const q of now) {
      const b = before.get(q.query_id)
      if (!b) continue
      const diff = TIER(q.demand_score) - TIER(b.demand_score)
      if (Math.abs(diff) >= 2) {
        out.push({
          id: `q:${q.query_id}`, kind: diff > 0 ? 'query_up' : 'query_down', subject_id: subjectId, week_start: latest.week_start, query_id: q.query_id,
          line: `"${q.query}" ${diff > 0 ? 'rose' : 'fell'} from ${b.demand_score} to ${q.demand_score} demand for ${name}.`,
        })
      }
    }

    // A competitor newly on top of the gap, cited three or more times.
    const g = gapOf(latest)
    const pg = gapOf(prior)
    if (g.domain && g.times_cited >= 3 && g.domain !== pg.domain) {
      out.push({
        id: `gap:${subjectId}:${latest.week_start}`, kind: 'new_competitor', subject_id: subjectId, week_start: latest.week_start,
        line: `${g.domain} is now cited instead of ${name} on ${g.times_cited} answer${g.times_cited === 1 ? '' : 's'}${pg.domain ? ` (last week it was ${pg.domain})` : ''}.`,
      })
    }

    // A theme seen for the first time.
    const priorThemes = new Set(themesOf(prior).map(t => norm(t.theme)))
    for (const t of themesOf(latest)) {
      if (!priorThemes.has(norm(t.theme))) {
        out.push({
          id: `theme:${subjectId}:${norm(t.theme).slice(0, 40)}`, kind: 'new_theme', subject_id: subjectId, week_start: latest.week_start,
          line: `A new theme from ${name}'s calls: ${t.theme} (${t.calls} call${t.calls === 1 ? '' : 's'}).`,
        })
      }
    }
  }

  const weight: Record<MovementKind, number> = { first_citation: 0, new_competitor: 1, query_up: 2, query_down: 3, new_theme: 4 }
  return out.sort((a, b) => weight[a.kind] - weight[b.kind])
}

/** True when no subject has a digest before its latest one. */
export function isFirstWeek(digests: AeoDigestRow[]): boolean {
  if (!digests.length) return false
  for (const { prior } of digestsBySubject(digests).values()) if (prior) return false
  return true
}

// ── The portfolio sentence ───────────────────────────────────────────────────

export interface PortfolioRead {
  never_run: boolean
  first_week: boolean
  counts: Record<SubjectKind, number>
  this_week: { cited: number; total: number; rate: number | null }
  last_week: { cited: number; total: number; rate: number | null }
  biggest_gap: { domain: string; times_cited: number; subject: string } | null
  last_run: string | null
  sentence: string
}

function pctWord(rate: number | null): string {
  return rate == null ? 'none' : `${Math.round(rate * 100)}%`
}

export function portfolioRead(input: {
  subjects: AeoSubjectRow[]
  digests: AeoDigestRow[]
  probes: GeoProbeRow[]
  now?: Date
}): PortfolioRead {
  const now = input.now ?? new Date()
  const active = input.subjects.filter(s => s.active)
  const counts: Record<SubjectKind, number> = { venture: 0, prospect: 0, aspiration: 0 }
  for (const s of active) counts[s.kind] += 1
  const weeks = weekShares(input.probes, 2, now)
  const lastWeek = weeks[0]
  const thisWeek = weeks[1]
  const bySubject = digestsBySubject(input.digests)
  const subjectOf = new Map(active.map(s => [s.id, s]))

  let biggest: PortfolioRead['biggest_gap'] = null
  let lastRun: string | null = null
  for (const [id, { latest }] of bySubject) {
    const g = gapOf(latest)
    if (g.domain && (!biggest || g.times_cited > biggest.times_cited)) biggest = { domain: g.domain, times_cited: g.times_cited, subject: subjectLabel(subjectOf.get(id)) }
    const gen = statsOf(latest).generated_at || latest.created_at
    if (!lastRun || gen > lastRun) lastRun = gen
  }

  const neverRun = bySubject.size === 0
  const firstWeek = isFirstWeek(input.digests)
  const parts: string[] = []
  const kindsLine = [
    counts.venture ? `${counts.venture} venture${counts.venture === 1 ? '' : 's'}` : '',
    counts.prospect ? `${counts.prospect} compan${counts.prospect === 1 ? 'y' : 'ies'} you want to sell to` : '',
    counts.aspiration ? `${counts.aspiration} you want to be like` : '',
  ].filter(Boolean)
  const across = kindsLine.length ? `Across ${kindsLine.join(', ')}` : 'With no subjects yet'

  if (neverRun) {
    parts.push(`${across}, the research machine has not run yet. It runs every Sunday and nothing shows here until a real run lands.`)
    if (thisWeek.total || lastWeek.total) parts.push(`The older probe says ${pctWord(thisWeek.total ? thisWeek.rate : lastWeek.rate)} of ${thisWeek.total || lastWeek.total} answers mentioned you.`)
  } else {
    if (thisWeek.total) {
      parts.push(`${across}, ${pctWord(thisWeek.rate)} of ${thisWeek.total} answers mentioned you this week${lastWeek.total ? `, ${pctWord(lastWeek.rate)} of ${lastWeek.total} last week` : ''}.`)
    } else if (lastWeek.total) {
      parts.push(`${across}, no answers were asked this week yet. Last week ${pctWord(lastWeek.rate)} of ${lastWeek.total} mentioned you.`)
    } else {
      parts.push(`${across}, no engine has been asked in the last two weeks.`)
    }
    if (biggest) parts.push(`Biggest gap: ${biggest.domain}, cited ${biggest.times_cited} time${biggest.times_cited === 1 ? '' : 's'} instead of ${biggest.subject}.`)
    if (lastRun) parts.push(`Last run ${dayLabel(lastRun)}.`)
  }

  return {
    never_run: neverRun,
    first_week: firstWeek,
    counts,
    this_week: thisWeek,
    last_week: lastWeek,
    biggest_gap: biggest,
    last_run: lastRun,
    sentence: parts.join(' '),
  }
}

/** The caption under Run now, from the newest command row. */
export function commandCaption(c: AeoCommandRow | null | undefined, dispatched?: boolean | null, dispatchError?: string | null): string {
  if (dispatched === false) return `Queued but could not start${dispatchError ? `: ${dispatchError}` : ''}. It will run on Sunday.`
  if (!c) return ''
  if (c.state === 'queued') return dispatched ? 'Started. Results land within the hour.' : 'Queued, waiting to start.'
  if (c.state === 'running') return `Running since ${dayLabel(c.started_at || c.requested_at)}.`
  if (c.state === 'done') return `Last run finished ${dayLabel(c.finished_at || c.requested_at)}${c.result ? `: ${c.result}` : ''}.`
  if (c.state === 'failed') return `Last run failed${c.error ? `: ${c.error}` : ''}.`
  return 'Superseded by the scheduled run.'
}
