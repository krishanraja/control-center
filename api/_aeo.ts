import { sanitizeVoice } from './_content.js'
import { AEO_ENGINES, AEO_THEMES_STATUSES, PRODUCT_SLUGS, SUBJECT_KINDS, mondayOf } from './_growth.js'

// _aeo: the pure half of the AEO engine's landing (api/aeo/*).
//
// krishanraja/AEO-Engine runs on GitHub Actions every Sunday and POSTs one
// AeoPacket per subject per week to api/aeo/ingest.ts. This file is what the
// ingest trusts: the packet contract (docs/AEO-PACKET.schema.json is the
// machine copy, kept identical to docs/packet.schema.json in the engine
// repo), the row the content spine receives, and the source_ref that keeps a
// re-run from duplicating a week. Nothing here touches the database, so
// tests/api/aeo.test.ts and the guards can import it.
//
// Two rules the validator enforces that the schema alone cannot say:
//   Private calls stay private. themes and call_evidence are read with the
//   anon key on the Growth tab, so a packet carrying an email address or an
//   @handle is refused as a whole. Paraphrases only.
//   No em dashes. Every string passes through sanitizeVoice on the way in, so
//   what is stored equals what the house copy standard allows.

export const PACKET_SCHEMA_VERSION = 1

export const MAX_QUERIES = 60
export const MAX_PROBES = 600
export const MAX_RECOMMENDATIONS = 5
/** How many recommendations one subject may push into content_ideas in a week. */
export const MAX_IDEAS_PER_SUBJECT = 3
/** While this many aeo_signal rows sit undecided, the ingest lands the digest
 *  but adds no more ideas (the build-signal governor, same reasoning). */
export const OPEN_GOVERNOR = 12
/** An undecided recommendation expires like any seed. Three weeks matches
 *  SIGNAL_TTL_DAYS in api/_buildSignals.ts and the radar's owned-source
 *  lookback. */
export const SIGNAL_TTL_DAYS = 21

export type SubjectKind = 'venture' | 'prospect' | 'aspiration'
export type AeoEngine = 'perplexity' | 'chatgpt' | 'claude' | 'grok'
export type ThemesStatus = 'ok' | 'no_calls' | 'no_attributed_calls' | 'fireflies_unavailable' | 'not_applicable'

export interface AeoEvidence { call_ref: string; date: string; paraphrase: string }

export interface AeoProbe {
  engine: AeoEngine
  model: string
  question: string
  answer_snapshot: string
  we_cited: boolean
  citations: string[]
  cost_usd: number
}

export interface AeoQuery {
  query_id: string
  query: string
  source: 'transcript' | 'gap' | 'seed' | 'striking_distance' | 'watch_carry' | 'room_signal'
  demand_score: number
  demand_basis: { llm_demand: number; transcript_evidence: number; rising_volume: number; labels: string[] }
  call_evidence: AeoEvidence[]
  gap: { we_cited_engines: AeoEngine[]; competitor_domains: string[] }
  trend: 'new' | 'up' | 'flat' | 'down'
  status: 'watch' | 'recommend' | 'drop'
  touchpoint_id: string | null
  probes: AeoProbe[]
}

export interface AeoRecommendation {
  n: number
  title: string
  target_query: string
  query_id: string
  angle: string
  evidence: string[]
  engines: AeoEngine[]
  demand: number
}

export interface AeoPacket {
  schema_version: 1
  run_id: string
  command_id: number | null
  subject: { id: string; kind: SubjectKind; slug: string; product_slug: string | null }
  week_start: string
  generated_at: string
  engines: AeoEngine[]
  themes_status: ThemesStatus
  themes: Array<{ theme: string; calls: number; evidence: AeoEvidence[] }>
  calls: { considered: number; attributed: number }
  queries: AeoQuery[]
  strongest_signal: string | null
  recommendations: AeoRecommendation[]
  watch_list: Array<{ query_id: string; query: string; why: string }>
  competitor_gap: { domain: string | null; times_cited: number; questions: string[] }
  playbook: Array<{ url: string; host: string; path_pattern: string; times_cited: number; why: string }> | null
  approach_hook: string | null
  stats: {
    queries: number; probes: number; probes_failed: number; probes_skipped_cap: number
    cost_usd: number; engines: number; transcripts: number; digest_writer: 'claude' | 'fallback'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD = /^\d{4}-\d{2}-\d{2}$/
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const HANDLE = /(^|[\s(])@[A-Za-z0-9_]{2,}/
const CALL_REF = /^[0-9a-f]{8}$/
const SOURCES = new Set(['transcript', 'gap', 'seed', 'striking_distance', 'watch_carry', 'room_signal'])
const TRENDS = new Set(['new', 'up', 'flat', 'down'])
const STATUSES = new Set(['watch', 'recommend', 'drop'])

type Errs = string[]

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Walk every string in the packet: sanitize in place, refuse private material. */
function sweepStrings(value: unknown, path: string, errs: Errs): unknown {
  if (typeof value === 'string') {
    if (EMAIL.test(value)) errs.push(`${path}: contains an email address`)
    if (HANDLE.test(value)) errs.push(`${path}: contains an @handle`)
    return sanitizeVoice(value)
  }
  if (Array.isArray(value)) return value.map((v, i) => sweepStrings(v, `${path}[${i}]`, errs))
  if (isObj(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = sweepStrings(v, `${path}.${k}`, errs)
    return out
  }
  return value
}

function str(v: unknown, path: string, max: number, errs: Errs, min = 1): v is string {
  if (typeof v !== 'string') { errs.push(`${path}: must be a string`); return false }
  if (v.length < min) { errs.push(`${path}: too short`); return false }
  if (v.length > max) { errs.push(`${path}: over ${max} characters`); return false }
  return true
}

function int(v: unknown, path: string, lo: number, hi: number, errs: Errs): v is number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) { errs.push(`${path}: must be an integer between ${lo} and ${hi}`); return false }
  return true
}

function arr(v: unknown, path: string, max: number, errs: Errs): v is unknown[] {
  if (!Array.isArray(v)) { errs.push(`${path}: must be an array`); return false }
  if (v.length > max) { errs.push(`${path}: more than ${max} items`); return false }
  return true
}

function evidenceOk(v: unknown, path: string, errs: Errs): void {
  if (!isObj(v)) { errs.push(`${path}: must be an object`); return }
  if (typeof v.call_ref !== 'string' || !CALL_REF.test(v.call_ref)) errs.push(`${path}.call_ref: must be an 8 hex character hash, never a transcript id`)
  if (typeof v.date !== 'string' || !YMD.test(v.date)) errs.push(`${path}.date: must be YYYY-MM-DD`)
  str(v.paraphrase, `${path}.paraphrase`, 200, errs)
}

/**
 * The whole packet, checked against the contract. Returns the sanitized
 * packet on success (strings cleaned), or every problem found, so the engine
 * sees one 400 with the full list rather than one per push.
 */
export function validatePacket(input: unknown): { ok: true; packet: AeoPacket } | { ok: false; errors: string[] } {
  const errs: Errs = []
  if (!isObj(input)) return { ok: false, errors: ['packet must be a JSON object'] }
  const p = sweepStrings(input, 'packet', errs) as Record<string, unknown>

  if (p.schema_version !== PACKET_SCHEMA_VERSION) errs.push(`packet.schema_version: must be ${PACKET_SCHEMA_VERSION}`)
  if (typeof p.run_id !== 'string' || !UUID.test(p.run_id)) errs.push('packet.run_id: must be a uuid')
  if (!(p.command_id === null || (typeof p.command_id === 'number' && Number.isInteger(p.command_id) && p.command_id >= 1))) errs.push('packet.command_id: must be a positive integer or null')

  const subject = isObj(p.subject) ? p.subject : null
  if (!subject) errs.push('packet.subject: required')
  else {
    if (typeof subject.id !== 'string' || !UUID.test(subject.id)) errs.push('packet.subject.id: must be a uuid')
    if (typeof subject.kind !== 'string' || !SUBJECT_KINDS.has(subject.kind)) errs.push('packet.subject.kind: must be venture, prospect or aspiration')
    if (typeof subject.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(subject.slug)) errs.push('packet.subject.slug: lower-case letters, digits and hyphens')
    if (!(subject.product_slug === null || (typeof subject.product_slug === 'string' && PRODUCT_SLUGS.has(subject.product_slug)))) errs.push('packet.subject.product_slug: must be a Growth product slug or null')
    if (subject.kind === 'venture' && subject.product_slug === null) errs.push('packet.subject.product_slug: a venture must name its product slug')
    if (subject.kind !== 'venture' && subject.product_slug !== null) errs.push('packet.subject.product_slug: only a venture carries a product slug')
  }

  if (typeof p.week_start !== 'string' || !YMD.test(p.week_start)) errs.push('packet.week_start: must be YYYY-MM-DD')
  else if (mondayOf(new Date(`${p.week_start}T00:00:00Z`)) !== p.week_start) errs.push('packet.week_start: must be a Monday (UTC)')
  if (typeof p.generated_at !== 'string' || Number.isNaN(Date.parse(p.generated_at))) errs.push('packet.generated_at: must be an ISO timestamp')

  if (arr(p.engines, 'packet.engines', 4, errs)) {
    if (!p.engines.length) errs.push('packet.engines: at least one engine')
    for (const [i, e] of p.engines.entries()) if (typeof e !== 'string' || !AEO_ENGINES.has(e)) errs.push(`packet.engines[${i}]: unknown engine`)
    if (new Set(p.engines).size !== p.engines.length) errs.push('packet.engines: duplicates')
  }

  if (typeof p.themes_status !== 'string' || !AEO_THEMES_STATUSES.has(p.themes_status)) errs.push('packet.themes_status: unknown value')
  if (arr(p.themes, 'packet.themes', 10, errs)) {
    for (const [i, t] of p.themes.entries()) {
      const path = `packet.themes[${i}]`
      if (!isObj(t)) { errs.push(`${path}: must be an object`); continue }
      str(t.theme, `${path}.theme`, 200, errs)
      int(t.calls, `${path}.calls`, 1, 10_000, errs)
      if (arr(t.evidence, `${path}.evidence`, 6, errs)) t.evidence.forEach((e, j) => evidenceOk(e, `${path}.evidence[${j}]`, errs))
    }
    if (p.themes_status !== 'ok' && p.themes.length) errs.push('packet.themes: must be empty unless themes_status is ok')
  }
  if (!isObj(p.calls)) errs.push('packet.calls: required')
  else {
    int(p.calls.considered, 'packet.calls.considered', 0, 100_000, errs)
    int(p.calls.attributed, 'packet.calls.attributed', 0, 100_000, errs)
  }

  const queryIds = new Set<string>()
  let probeCount = 0
  if (arr(p.queries, 'packet.queries', MAX_QUERIES, errs)) {
    for (const [i, q] of p.queries.entries()) {
      const path = `packet.queries[${i}]`
      if (!isObj(q)) { errs.push(`${path}: must be an object`); continue }
      if (typeof q.query_id !== 'string' || !UUID.test(q.query_id)) errs.push(`${path}.query_id: must be a uuid`)
      else if (queryIds.has(q.query_id)) errs.push(`${path}.query_id: repeated`)
      else queryIds.add(q.query_id)
      str(q.query, `${path}.query`, 400, errs, 3)
      if (typeof q.source !== 'string' || !SOURCES.has(q.source)) errs.push(`${path}.source: unknown value`)
      int(q.demand_score, `${path}.demand_score`, 0, 100, errs)
      if (!isObj(q.demand_basis)) errs.push(`${path}.demand_basis: required`)
      else {
        int(q.demand_basis.llm_demand, `${path}.demand_basis.llm_demand`, 0, 40, errs)
        int(q.demand_basis.transcript_evidence, `${path}.demand_basis.transcript_evidence`, 0, 30, errs)
        int(q.demand_basis.rising_volume, `${path}.demand_basis.rising_volume`, 0, 30, errs)
        if (!Array.isArray(q.demand_basis.labels)) errs.push(`${path}.demand_basis.labels: must be an array`)
      }
      if (arr(q.call_evidence, `${path}.call_evidence`, 10, errs)) q.call_evidence.forEach((e, j) => evidenceOk(e, `${path}.call_evidence[${j}]`, errs))
      if (!isObj(q.gap)) errs.push(`${path}.gap: required`)
      else {
        if (arr(q.gap.we_cited_engines, `${path}.gap.we_cited_engines`, 4, errs)) for (const e of q.gap.we_cited_engines) if (typeof e !== 'string' || !AEO_ENGINES.has(e)) errs.push(`${path}.gap.we_cited_engines: unknown engine`)
        arr(q.gap.competitor_domains, `${path}.gap.competitor_domains`, 12, errs)
      }
      if (typeof q.trend !== 'string' || !TRENDS.has(q.trend)) errs.push(`${path}.trend: unknown value`)
      if (typeof q.status !== 'string' || !STATUSES.has(q.status)) errs.push(`${path}.status: unknown value`)
      if (!(q.touchpoint_id === null || (typeof q.touchpoint_id === 'string' && UUID.test(q.touchpoint_id)))) errs.push(`${path}.touchpoint_id: uuid or null`)
      if (arr(q.probes, `${path}.probes`, 8, errs)) {
        probeCount += q.probes.length
        for (const [j, pr] of q.probes.entries()) {
          const pp = `${path}.probes[${j}]`
          if (!isObj(pr)) { errs.push(`${pp}: must be an object`); continue }
          if (typeof pr.engine !== 'string' || !AEO_ENGINES.has(pr.engine)) errs.push(`${pp}.engine: unknown engine`)
          str(pr.model, `${pp}.model`, 80, errs)
          str(pr.question, `${pp}.question`, 400, errs)
          str(pr.answer_snapshot, `${pp}.answer_snapshot`, 1800, errs, 0)
          if (typeof pr.we_cited !== 'boolean') errs.push(`${pp}.we_cited: must be a boolean`)
          arr(pr.citations, `${pp}.citations`, 8, errs)
          if (typeof pr.cost_usd !== 'number' || pr.cost_usd < 0) errs.push(`${pp}.cost_usd: must be a number, zero or more`)
        }
      }
    }
  }
  if (probeCount > MAX_PROBES) errs.push(`packet.queries: ${probeCount} probes is over the ${MAX_PROBES} cap`)

  if (!(p.strongest_signal === null || str(p.strongest_signal, 'packet.strongest_signal', 240, errs))) { /* reported */ }
  if (arr(p.recommendations, 'packet.recommendations', MAX_RECOMMENDATIONS, errs)) {
    for (const [i, r] of p.recommendations.entries()) {
      const path = `packet.recommendations[${i}]`
      if (!isObj(r)) { errs.push(`${path}: must be an object`); continue }
      int(r.n, `${path}.n`, 1, MAX_RECOMMENDATIONS, errs)
      str(r.title, `${path}.title`, 200, errs)
      str(r.target_query, `${path}.target_query`, 400, errs)
      if (typeof r.query_id !== 'string' || !UUID.test(r.query_id)) errs.push(`${path}.query_id: must be a uuid`)
      else if (queryIds.size && !queryIds.has(r.query_id)) errs.push(`${path}.query_id: not one of the packet's queries`)
      str(r.angle, `${path}.angle`, 600, errs)
      arr(r.evidence, `${path}.evidence`, 6, errs)
      if (arr(r.engines, `${path}.engines`, 4, errs)) for (const e of r.engines) if (typeof e !== 'string' || !AEO_ENGINES.has(e)) errs.push(`${path}.engines: unknown engine`)
      int(r.demand, `${path}.demand`, 0, 100, errs)
    }
  }
  if (arr(p.watch_list, 'packet.watch_list', 15, errs)) {
    for (const [i, w] of p.watch_list.entries()) {
      const path = `packet.watch_list[${i}]`
      if (!isObj(w)) { errs.push(`${path}: must be an object`); continue }
      if (typeof w.query_id !== 'string' || !UUID.test(w.query_id)) errs.push(`${path}.query_id: must be a uuid`)
      str(w.query, `${path}.query`, 400, errs)
      str(w.why, `${path}.why`, 240, errs, 0)
    }
  }
  if (!isObj(p.competitor_gap)) errs.push('packet.competitor_gap: required')
  else {
    if (!(p.competitor_gap.domain === null || str(p.competitor_gap.domain, 'packet.competitor_gap.domain', 120, errs))) { /* reported */ }
    int(p.competitor_gap.times_cited, 'packet.competitor_gap.times_cited', 0, 100_000, errs)
    arr(p.competitor_gap.questions, 'packet.competitor_gap.questions', 10, errs)
  }
  if (!(p.playbook === null || arr(p.playbook, 'packet.playbook', 12, errs))) { /* reported */ }
  if (!(p.approach_hook === null || str(p.approach_hook, 'packet.approach_hook', 300, errs))) { /* reported */ }
  if (subject && subject.kind !== 'aspiration' && Array.isArray(p.playbook)) errs.push('packet.playbook: only an aspiration carries a playbook')
  if (subject && subject.kind !== 'prospect' && typeof p.approach_hook === 'string') errs.push('packet.approach_hook: only a prospect carries an approach hook')

  if (!isObj(p.stats)) errs.push('packet.stats: required')
  else {
    for (const k of ['queries', 'probes', 'probes_failed', 'probes_skipped_cap', 'engines', 'transcripts']) int(p.stats[k], `packet.stats.${k}`, 0, 1_000_000, errs)
    if (typeof p.stats.cost_usd !== 'number' || p.stats.cost_usd < 0) errs.push('packet.stats.cost_usd: must be a number, zero or more')
    if (p.stats.digest_writer !== 'claude' && p.stats.digest_writer !== 'fallback') errs.push('packet.stats.digest_writer: claude or fallback')
  }

  if (errs.length) return { ok: false, errors: errs.slice(0, 40) }
  return { ok: true, packet: p as unknown as AeoPacket }
}

/** One live content_ideas source row per recommendation per subject-week. */
export function aeoSourceRef(kind: SubjectKind, slug: string, weekStart: string, n: number): string {
  return `aeo:${kind}:${slug}:${weekStart}:${n}`
}

export interface AeoSignalRow {
  idea: string
  thesis: string
  source_type: 'aeo_signal'
  source_ref: string
  source_url: string | null
  source_snippet: string | null
  source_captured_at: string
  state: 'seeded'
  origin: 'agent'
  assigned_to: 'cleo'
  lane: 'publication'
  horizon: 'news'
  expires_at: string
  distribution: string[]
  touchpoint_id: string | null
  meta: {
    source_label: string
    aeo: {
      subject_id: string
      subject_kind: SubjectKind
      subject_slug: string
      product_slug: string | null
      week_start: string
      run_id: string
      n: number
      target_query: string
      query_id: string
      angle: string
      evidence: string[]
      engines: AeoEngine[]
      demand: number
      approach_hook: string | null
    }
  }
}

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** The row the content spine receives, shaped like buildSignalRow so the
 *  radar, the route and the card treat it as one more owned source. */
export function aeoSignalRow(packet: AeoPacket, rec: AeoRecommendation, subjectName: string, now = new Date()): AeoSignalRow {
  const query = packet.queries.find(q => q.query_id === rec.query_id)
  const kindLabel = packet.subject.kind === 'venture' ? subjectName
    : packet.subject.kind === 'prospect' ? `to be in front of ${subjectName}`
      : `learning from ${subjectName}`
  return {
    idea: cut(rec.title, 200),
    thesis: cut(rec.angle, 500),
    source_type: 'aeo_signal',
    source_ref: aeoSourceRef(packet.subject.kind, packet.subject.slug, packet.week_start, rec.n),
    source_url: null,
    source_snippet: cut(`Target query: ${rec.target_query}. ${rec.evidence.join(' ')}`, 400),
    source_captured_at: packet.generated_at,
    state: 'seeded',
    origin: 'agent',
    assigned_to: 'cleo',
    lane: 'publication',
    horizon: 'news',
    expires_at: new Date(now.getTime() + SIGNAL_TTL_DAYS * 86_400_000).toISOString(),
    distribution: [],
    touchpoint_id: query?.touchpoint_id ?? null,
    meta: {
      source_label: `AEO research, ${kindLabel}`,
      aeo: {
        subject_id: packet.subject.id,
        subject_kind: packet.subject.kind,
        subject_slug: packet.subject.slug,
        product_slug: packet.subject.product_slug,
        week_start: packet.week_start,
        run_id: packet.run_id,
        n: rec.n,
        target_query: rec.target_query,
        query_id: rec.query_id,
        angle: rec.angle,
        evidence: rec.evidence,
        engines: rec.engines,
        demand: rec.demand,
        approach_hook: packet.approach_hook,
      },
    },
  }
}

/** What the editorial radar reads for an AEO row: the question the piece is
 *  written to win, the angle, and the measured evidence, in one plain block. */
export function aeoSignalSummary(meta: AeoSignalRow['meta']['aeo'], thesis: string): string {
  const parts = [
    `Target query: ${meta.target_query}.`,
    thesis,
    meta.evidence.length ? `Evidence: ${meta.evidence.join(' ')}` : 'Evidence: none recorded.',
    meta.engines.length ? `Absent from the answer on: ${meta.engines.join(', ')}.` : '',
    `Demand ${meta.demand} of 100 (proxies, no prompt-volume corpus).`,
  ].filter(Boolean)
  return cut(parts.join(' '), 3500)
}

/** The probe rows one packet writes into growth_geo_probes. */
export function probeRows(packet: AeoPacket): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = []
  for (const q of packet.queries) {
    for (const pr of q.probes) {
      rows.push({
        product_slug: packet.subject.product_slug ?? packet.subject.slug,
        subject_id: packet.subject.id,
        subject_kind: packet.subject.kind,
        run_id: packet.run_id,
        query_id: q.query_id,
        question: pr.question,
        engine: pr.engine,
        answer_snapshot: pr.answer_snapshot.slice(0, 1800),
        we_cited: pr.we_cited,
        competitors_cited: pr.citations.slice(0, 8),
        touchpoint_id: q.touchpoint_id,
        run_at: packet.generated_at,
      })
    }
  }
  return rows
}

/** The query rows one packet writes into growth_aeo_queries. */
export function queryRows(packet: AeoPacket): Array<Record<string, unknown>> {
  return packet.queries.map(q => ({
    run_id: packet.run_id,
    query_id: q.query_id,
    subject_id: packet.subject.id,
    week_start: packet.week_start,
    query: q.query,
    source: q.source,
    demand_score: q.demand_score,
    demand_basis: q.demand_basis,
    call_evidence: q.call_evidence,
    gap: q.gap,
    trend: q.trend,
    status: q.status,
    touchpoint_id: q.touchpoint_id,
  }))
}
