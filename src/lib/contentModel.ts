/**
 * The Content tab's model of the engine, as plain functions over rows.
 *
 * WHY THIS FILE EXISTS. The tab was built around the engine's old shape: rooms
 * that ignored the series the engine stores on each piece, a "To decide" pile
 * the engine repairs on its own, and none of the calls Krish actually makes
 * (approve, a paid fact check, how sure we are, the week's three picks). The
 * redesign sits on this file instead of on component-local filters, so every
 * surface asks the same questions and gets the same answers.
 *
 * Everything here is pure and deterministic. The same rows in any order give
 * the same output, because a list that re-sorts itself when a background
 * refetch lands is the "cards change while I read" complaint, and every sort
 * below ends on the row id for that reason.
 *
 * What it reads, verified against the live tables on 2026-10-04 (SELECT only):
 *   - content_ideas.state is one of seeded, researching, drafting, review,
 *     approved, published, dropped, absorbed (content_ideas_state_check).
 *   - meta.ladder carries final {band, score, weakest}, first, router
 *     {winner, fits}, expansion, attempts, panel_run_id, judged_at on every
 *     judged row (163 of them). Bands are ready, repairable and weak.
 *   - the series is lane_slot. `lane` is null on most rows (151 of 154 live),
 *     and 23 live rows have no lane_slot but a router winner.
 *   - meta.fact_check {passed, blocking, body_hash, ran_at, version} is
 *     written by the engine's fact gate; the gate itself is only readable
 *     through GET /api/content-ideas/:id/fact-check, because its hash is taken
 *     over the engine's own normalisation of the body.
 *   - "How sure we are: N%" lives in the body, inside the prediction section.
 *     The engine reads it there (content-engine packages/contracts/src/call.ts)
 *     and refuses approval without it (api/_publishChecks.ts, CALL).
 */
import { SUBCHANNELS, resolveFormat, type FormatDef } from './formats'
import { ladderVerdict } from './ladder'
import { REVIEW_MIN_BODY } from './contentEngine'

// ── The row shape this file reads ──────────────────────────────────────────

/** The fields of a content_ideas row this model reads. ContentIdeaRow
 *  satisfies it, and so does a plain fixture. */
export interface IdeaInput {
  id: string
  idea?: string | null
  thesis?: string | null
  body?: string | null
  state: string
  lane?: string | null
  lane_slot?: string | null
  meta?: Record<string, any> | null
  buried_at?: string | null
  library_at?: string | null
  scheduled_for?: string | null
  published_at?: string | null
  expires_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  /** Rows this piece was built from or folded together with. */
  related_idea_ids?: string[] | null
  parent_idea_id?: string | null
}

// ── Stable order ───────────────────────────────────────────────────────────

/** Ascending by id. The last word in every sort here, so equal keys never
 *  come back in whatever order Postgres happened to return them. */
export function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Newest first, then by id. On 2026-10-03 seven live ideas shared one
 *  created_at to the microsecond, so a sort on created_at alone returned them
 *  in a different order after every write. */
export function compareNewestFirst(
  a: { id: string; created_at?: string | null },
  b: { id: string; created_at?: string | null },
): number {
  const ac = a.created_at || ''
  const bc = b.created_at || ''
  if (ac !== bc) return ac < bc ? 1 : -1
  return byId(a, b)
}

/** A sorted copy, newest first with the id tie-break. */
export function sortNewestFirst<T extends { id: string; created_at?: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort(compareNewestFirst)
}

// ── The series ─────────────────────────────────────────────────────────────

/** The series named by the stored columns, or null.
 *
 *  lane_slot is the series, whatever the lane says: the engine writes
 *  lane_slot and leaves lane null on most rows, and reading the slot only
 *  when lane said 'publication' is how the mind.the.gap room came to show 1 of
 *  its 56 pieces. A retired venture name in the lane column is still read,
 *  for rows from before the slot carried the format. */
export function storedSeries(lane?: string | null, slot?: string | null): string | null {
  const viaSlot = resolveFormat(slot)
  if (viaSlot && viaSlot.kind === 'subchannel') return viaSlot.slug
  const viaLane = resolveFormat(lane)
  if (viaLane && viaLane.kind === 'subchannel') return viaLane.slug
  return null
}

export type SeriesSource = 'stored' | 'judges' | null

/** The series and where it came from: the stored columns, or the judges'
 *  router when nothing is stored. */
export function seriesWithSource(idea: Pick<IdeaInput, 'lane' | 'lane_slot' | 'meta'>): { series: string | null; source: SeriesSource } {
  const stored = storedSeries(idea.lane, idea.lane_slot)
  if (stored) return { series: stored, source: 'stored' }
  const winner = ladderVerdict(idea)?.winner
  const judged = resolveFormat(winner)
  if (judged && judged.kind === 'subchannel') return { series: judged.slug, source: 'judges' }
  return { series: null, source: null }
}

/**
 * The one answer to "which series is this piece for".
 *
 * Every surface that derives a series comes through here: the rooms, the
 * decide card, the week's slots and the pipeline counts. Before this, the room
 * list read `lane` and the decide card read `lane_slot`, and one screen gave
 * two answers about the same piece.
 */
export function seriesOf(idea: Pick<IdeaInput, 'lane' | 'lane_slot' | 'meta'>): string | null {
  return seriesWithSource(idea).series
}

// ── What may be shown ──────────────────────────────────────────────────────

const CUT_OFF = /(?:\.{3}|…)["'”’)\]]*\s*$/

/**
 * The thesis to show, or null when there is none worth showing.
 *
 * Some stored summaries end in "..." or "…" because the source cut them off
 * before they reached us (23 rows on 2026-10-04, every one a pool headline).
 * A broken sentence on screen reads as the tab cutting it, which the copy
 * rule forbids, so such a summary is hidden rather than shown.
 */
export function displayThesis(idea: { thesis?: string | null }): string | null {
  const t = (idea.thesis || '').trim()
  if (!t) return null
  if (CUT_OFF.test(t)) return null
  return t
}

// ── How sure we are ────────────────────────────────────────────────────────
//
// These mirror the engine's own reader (content-engine
// packages/contracts/src/call.ts, callSectionOf and labelledConfidences) so the
// tab and the publish check agree on whether the number is set. They only
// ever touch the number after the label inside the prediction section, which
// is also the only thing the fact gate's hash leaves out (api/_factGate.ts,
// withoutConfidence): setting it never puts a passed fact check out of date.

const CALL_HEADING = /^#{1,3}\s*(OUR PREDICTION|THE CALL|PREDICTION)\b[^\n]*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im
const CALL_PARAGRAPH = /^\*\*(The Call|Our prediction)\.?\*\*[^\n]*(?:\n(?!\n)[^\n]*)*/im
const CONFIDENCE_SLOT = /(How sure we are|\bConfidence):([ \t]*)(\d{1,3}(?:\.\d+)?%|\[[^\]\n]*\])?/gi

/** The prediction section: the text under its heading, or its bold-labelled
 *  paragraph. Null when the piece has neither. */
export function callSectionOf(body: string | null | undefined): string | null {
  const text = String(body ?? '')
  const heading = text.match(CALL_HEADING)
  if (heading) return heading[2] ?? ''
  const paragraph = text.match(CALL_PARAGRAPH)
  return paragraph ? paragraph[0] : null
}

export type HowSure =
  | { state: 'set'; percent: number }
  /** The label is there and waits for his number ("[Krish to set]"). */
  | { state: 'unset' }
  /** No prediction section, or no label in it. That is the writer's job,
   *  not a number for Krish to set. */
  | { state: 'missing' }

/** Whether the piece's prediction has its "How sure we are" number. */
export function howSureOf(body: string | null | undefined): HowSure {
  const section = callSectionOf(String(body ?? '').replace(/\r\n?/g, '\n'))
  if (section === null) return { state: 'missing' }
  const found = [...section.matchAll(CONFIDENCE_SLOT)]
  if (!found.length) return { state: 'missing' }
  const numbers = found
    .map(m => m[3] ?? '')
    .filter(v => /^\d{1,3}%$/.test(v))
    .map(v => Number(v.slice(0, -1)))
  const distinct = [...new Set(numbers)]
  // One whole number from 1 to 99, and no label left waiting. Anything else
  // is a number the publish check would refuse, so it still needs his call.
  if (distinct.length === 1 && numbers.length === found.length && distinct[0]! >= 1 && distinct[0]! <= 99) {
    return { state: 'set', percent: distinct[0]! }
  }
  return { state: 'unset' }
}

/**
 * The body with "How sure we are" set to `percent`.
 *
 * Every labelled number or placeholder inside the prediction section becomes
 * the new number, so the publish check reads exactly one. The spacing after
 * the label is kept as written, because the fact gate's hash keeps it too.
 */
export function withHowSure(body: string | null | undefined, percent: number):
  { ok: true; body: string } | { ok: false; reason: string } {
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) {
    return { ok: false, reason: 'How sure we are is a whole percentage from 1 to 99.' }
  }
  const text = String(body ?? '')
  const section = callSectionOf(text)
  if (section === null) return { ok: false, reason: 'This piece has no prediction yet, so there is nothing to put a number on.' }
  let hits = 0
  const next = section.replace(CONFIDENCE_SLOT, (_m, label: string, ws: string, value: string | undefined) => {
    hits += 1
    return `${label}:${value ? ws : (ws || ' ')}${percent}%`
  })
  if (!hits) return { ok: false, reason: 'The prediction has no "How sure we are:" line to put the number on.' }
  const start = text.indexOf(section)
  if (start < 0) return { ok: false, reason: 'The prediction could not be found again in the text.' }
  return { ok: true, body: text.slice(0, start) + next + text.slice(start + section.length) }
}

// ── Where a piece stands in the engine's flow ──────────────────────────────

export type Stage =
  | 'found'
  | 'judged_ready'
  | 'needs_work'
  | 'weak'
  | 'writing'
  | 'fact_check'
  | 'your_call'
  | 'ready_to_go'
  | 'out'

/** The engine's flow, in order. */
export const STAGES: readonly Stage[] = Object.freeze([
  'found', 'judged_ready', 'needs_work', 'weak', 'writing', 'fact_check', 'your_call', 'ready_to_go', 'out',
])

/** Plain words for each stage, for a person. */
export const STAGE_LABEL: Readonly<Record<Stage, string>> = Object.freeze({
  found: 'Found',
  judged_ready: 'Judged ready',
  needs_work: 'Needs work',
  weak: 'Weak',
  writing: 'Being written',
  fact_check: 'Fact check',
  your_call: 'Needs your call',
  ready_to_go: 'Ready to go out',
  out: 'Out',
})

/** What the engine's fact gate says about one piece's current words, as read
 *  from GET /api/content-ideas/:id/fact-check (`gate.ok`, `next_run`). */
export interface FactGateRead {
  ok: boolean
  reason?: string | null
  /** Sentences a rerun would check fresh; a paid check is capped on this. */
  freshSentences?: number | null
}

export type GateMap = Readonly<Record<string, FactGateRead | undefined>>

/** The fact gate for one piece. With the engine's read it is a fact; without
 *  it, the stored result is a best guess and says so (`known: false`), since
 *  the stored check may be of an older version of the words. */
export function factGateOf(idea: Pick<IdeaInput, 'meta'>, gate?: FactGateRead | null): { ok: boolean; known: boolean; ran: boolean } {
  const fc = idea.meta?.fact_check
  const ran = Boolean(fc && typeof fc === 'object')
  if (gate) return { ok: gate.ok === true, known: true, ran }
  return { ok: ran && fc.passed === true, known: false, ran }
}

function hasDraft(idea: Pick<IdeaInput, 'body'>): boolean {
  return (idea.body || '').trim().length >= REVIEW_MIN_BODY
}

/**
 * Where a piece stands, or null when it is off the board (dropped, folded
 * into another piece, set aside, or kept in the Library).
 *
 * found         seeded or researching, not judged yet
 * judged_ready  judged 7 or more and waiting to be picked
 * needs_work    judged 5 or 6; the engine keeps repairing these on its own
 * weak          judged under 5
 * writing       drafting or in review, with no real draft yet
 * fact_check    a real draft whose facts have not passed on these words
 * your_call     the facts passed and the piece waits on Krish to read it
 * ready_to_go   approved, not out yet
 * out           published
 */
export function stageOf(idea: IdeaInput, gate?: FactGateRead | null): Stage | null {
  if (idea.state === 'published') return 'out'
  if (idea.state === 'dropped' || idea.state === 'absorbed') return null
  if (idea.buried_at || idea.library_at) return null
  if (idea.state === 'approved') return 'ready_to_go'
  if (idea.state === 'review' || idea.state === 'drafting') {
    if (!hasDraft(idea)) return 'writing'
    return factGateOf(idea, gate).ok ? 'your_call' : 'fact_check'
  }
  if (idea.state === 'seeded' || idea.state === 'researching') {
    const band = ladderVerdict(idea)?.band
    if (band === 'ready') return 'judged_ready'
    if (band === 'repairable') return 'needs_work'
    if (band === 'weak') return 'weak'
    return 'found'
  }
  return null
}

// ── The pipeline at a glance ───────────────────────────────────────────────

export type StageCounts = Record<Stage, number>
const NO_SERIES = 'none'

function emptyCounts(): StageCounts {
  return Object.fromEntries(STAGES.map(s => [s, 0])) as StageCounts
}

export interface Pipeline {
  /** Pieces on the board. */
  total: number
  /** Pieces off the board: dropped, folded in, set aside or in the Library. */
  off: number
  byStage: StageCounts
  /** Keyed by series slug, plus 'none' for pieces with no series. Every live
   *  series is present even when it is empty, so a quiet one reads as zero
   *  rather than missing. */
  bySeries: Record<string, StageCounts>
}

/** How many pieces sit at each stage, overall and per series. */
export function pipeline(ideas: readonly IdeaInput[], gates: GateMap = {}, formats: readonly FormatDef[] = SUBCHANNELS): Pipeline {
  const byStage = emptyCounts()
  const bySeries: Record<string, StageCounts> = {}
  for (const f of formats) if (f.kind === 'subchannel') bySeries[f.slug] = emptyCounts()
  bySeries[NO_SERIES] = emptyCounts()
  let total = 0
  let off = 0
  for (const idea of ideas) {
    const stage = stageOf(idea, gates[idea.id])
    if (!stage) { off += 1; continue }
    total += 1
    byStage[stage] += 1
    const key = seriesOf(idea) ?? NO_SERIES
    ;(bySeries[key] ||= emptyCounts())[stage] += 1
  }
  return { total, off, byStage, bySeries }
}

// ── The week's slots ───────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** 0 (Sunday) to 6 from the table's own wording ("Mondays"), or null. */
export function cadenceWeekday(cadenceLabel: string | null | undefined): number | null {
  const lower = String(cadenceLabel ?? '').trim().toLowerCase()
  const i = WEEKDAYS.findIndex(d => lower.startsWith(d))
  return i >= 0 ? i : null
}

/** YYYY-MM-DD for `now` in a time zone, or in UTC when none is given. */
export function calendarDate(now: Date, timeZone?: string): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    } catch { /* an unknown zone falls back to UTC */ }
  }
  return now.toISOString().slice(0, 10)
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekdayOfDate(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

/** One piece as a slot shows it. */
export interface SlotPiece {
  id: string
  title: string
  state: string
  stage: Stage | null
  score: number | null
}

export interface WeekSlot {
  series: string
  label: string
  /** "Monday". */
  weekday: string
  /** The coming date this series goes out, YYYY-MM-DD, today included. */
  date: string
  /** The piece in flight for this slot, or null when the slot needs a pick. */
  picked: SlotPiece | null
  /** Other pieces in flight for this series, waiting for a later week. */
  queued: number
  /** The best three judged-ready pieces to pick from. */
  candidates: SlotPiece[]
  /** Every judged-ready piece for this series, less any a piece in the
   *  making was already built from (coveredIds). */
  readyCount: number
}

const IN_FLIGHT_RANK: Record<string, number> = { approved: 0, review: 1, drafting: 2 }

function slotPiece(idea: IdeaInput, gates: GateMap): SlotPiece {
  return {
    id: idea.id,
    title: (idea.idea || '').trim(),
    state: idea.state,
    stage: stageOf(idea, gates[idea.id]),
    score: ladderVerdict(idea)?.score ?? null,
  }
}

/** Best judged-ready first: the panel's standing, then the newest verdict,
 *  then the newest piece, then the id. */
export function compareCandidates(a: IdeaInput, b: IdeaInput): number {
  const va = ladderVerdict(a)
  const vb = ladderVerdict(b)
  const byScore = (vb?.score ?? -1) - (va?.score ?? -1)
  if (byScore) return byScore
  const ja = va?.judgedAt ?? ''
  const jb = vb?.judgedAt ?? ''
  if (ja !== jb) return ja < jb ? 1 : -1
  return compareNewestFirst(a, b)
}

const MADE_STATES = new Set(['drafting', 'review', 'approved', 'published'])

/**
 * Ids already covered by a piece being made or already out: the rows it was
 * built from (parent_idea_id) or folded together with (related_idea_ids).
 *
 * On 2026-10-04 the approved under.the.hood piece about Salesforce's Koa
 * listed a later pool headline with the same title among its related ideas,
 * and that headline was judged ready on its own. Offering it as next week's
 * pick would offer the piece he has already approved.
 */
export function coveredIds(ideas: readonly IdeaInput[]): Set<string> {
  const covered = new Set<string>()
  for (const i of ideas) {
    if (!MADE_STATES.has(i.state)) continue
    if (i.parent_idea_id) covered.add(i.parent_idea_id)
    for (const r of i.related_idea_ids ?? []) covered.add(r)
  }
  return covered
}

/**
 * The coming slot for each series that publishes on a fixed weekday, each
 * with its picked piece and the top three ready pieces to pick from.
 *
 * Days come from venture_formats.cadence_label ("Mondays") through the
 * formats snapshot, never from a copy here. A slot falls on the next such day,
 * today included. The pick is the piece in flight for that series: one
 * scheduled for that exact day wins, otherwise the furthest along (approved,
 * then in review, then drafting), oldest first. A piece scheduled for another
 * day belongs to that day, not this one.
 */
export function weekSlots(
  ideas: readonly IdeaInput[],
  formats: readonly FormatDef[] = SUBCHANNELS,
  now: Date = new Date(),
  opts: { timeZone?: string; gates?: GateMap } = {},
): WeekSlot[] {
  const gates = opts.gates ?? {}
  const today = calendarDate(now, opts.timeZone)
  const todayWd = weekdayOfDate(today)
  const covered = coveredIds(ideas)
  const slots: Array<WeekSlot & { order: number }> = []
  for (const f of formats) {
    if (f.kind !== 'subchannel' || !(f.target_per_week > 0)) continue
    const wd = cadenceWeekday(f.cadence_label)
    if (wd === null) continue
    const date = addDays(today, (wd - todayWd + 7) % 7)
    const mine = ideas.filter(i => seriesOf(i) === f.slug)

    const inFlight = mine
      .filter(i => i.state in IN_FLIGHT_RANK && !i.buried_at && !i.library_at && !i.published_at)
      .filter(i => !i.scheduled_for || i.scheduled_for === date)
      .sort((a, b) => {
        const onDay = Number(b.scheduled_for === date) - Number(a.scheduled_for === date)
        if (onDay) return onDay
        const rank = IN_FLIGHT_RANK[a.state]! - IN_FLIGHT_RANK[b.state]!
        if (rank) return rank
        const ac = a.created_at || ''
        const bc = b.created_at || ''
        if (ac !== bc) return ac < bc ? -1 : 1
        return byId(a, b)
      })

    const ready = mine
      .filter(i => stageOf(i, gates[i.id]) === 'judged_ready' && !covered.has(i.id))
      .sort(compareCandidates)

    slots.push({
      order: f.sort_order,
      series: f.slug,
      label: f.label,
      weekday: WEEKDAY_LABEL[wd],
      date,
      picked: inFlight[0] ? slotPiece(inFlight[0], gates) : null,
      queued: Math.max(0, inFlight.length - 1),
      candidates: ready.slice(0, 3).map(i => slotPiece(i, gates)),
      readyCount: ready.length,
    })
  }
  slots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order || (a.series < b.series ? -1 : 1)))
  return slots.map(s => ({
    series: s.series, label: s.label, weekday: s.weekday, date: s.date,
    picked: s.picked, queued: s.queued, candidates: s.candidates, readyCount: s.readyCount,
  }))
}

// ── Decisions from the engine's weekly run ─────────────────────────────────

export interface DecisionInput {
  id: string
  week: string
  kind: string
  ref: string
  status?: string | null
  payload?: Record<string, unknown> | null
  created_at?: string | null
}

/** The kinds the Friday run writes as a fresh snapshot each week
 *  (content-engine api/briefs/assemble.ts). A newer week replaces them. */
export const WEEKLY_SNAPSHOT_KINDS: readonly string[] = Object.freeze(['brief_review', 'graduation', 'purge_preview'])

const KIND_ORDER: Record<string, number> = {
  brief_review: 0, graduation: 1, shift_proposal: 2, shift_fading: 3, investigation: 4, purge_preview: 5,
}

function compareDecisions(a: DecisionInput, b: DecisionInput): number {
  if (a.week !== b.week) return a.week < b.week ? 1 : -1
  const ka = KIND_ORDER[a.kind] ?? 9
  const kb = KIND_ORDER[b.kind] ?? 9
  if (ka !== kb) return ka - kb
  const ac = a.created_at || ''
  const bc = b.created_at || ''
  if (ac !== bc) return ac < bc ? 1 : -1
  return byId(a, b)
}

/**
 * The pending decisions still worth asking, in a fixed order.
 *
 * The Friday run writes the weekly brief, the expiry notice and up to three
 * "keep for good" proposals as a fresh set every week. When a newer week's set
 * exists, the older week's set is superseded: on 2026-10-04 the W39 brief and
 * its three proposals were still pending beside W40's, and one piece was
 * offered twice. So older snapshot weeks are dropped, and "keep for good" is
 * deduplicated by the piece it names, newest kept. Everything else (shift
 * proposals, investigations) is per item and passes through.
 */
export function supersededDecisions<T extends DecisionInput>(decisions: readonly T[]): T[] {
  const pending = decisions.filter(d => !d.status || d.status === 'pending')
  let newestSnapshot = ''
  for (const d of pending) {
    if (WEEKLY_SNAPSHOT_KINDS.includes(d.kind) && d.week > newestSnapshot) newestSnapshot = d.week
  }
  const current = pending.filter(d => !WEEKLY_SNAPSHOT_KINDS.includes(d.kind) || d.week === newestSnapshot)
  const sorted = [...current].sort(compareDecisions)
  const seenRefs = new Set<string>()
  const out: T[] = []
  for (const d of sorted) {
    if (d.kind === 'graduation') {
      if (seenRefs.has(d.ref)) continue
      seenRefs.add(d.ref)
    }
    out.push(d)
  }
  return out
}

// ── Today's calls ──────────────────────────────────────────────────────────

/** What a pending Studio review needs from this model. */
export interface VideoReviewInput {
  id: string
  status: string
  safe_title?: string | null
  created_at?: string | null
}

/** What a work board item needs from this model (src/lib/workBoard.ts). */
export interface BoardItemInput {
  id: string
  lane: string
  rank?: number | null
  title: string
  detail?: string | null
  prompt?: string | null
  link?: string | null
}

export type CallKind =
  | 'approve'
  | 'board'
  | 'go_out'
  | 'allow_fact_check'
  | 'set_how_sure'
  | 'pick_for_series'
  | 'studio_review'
  | 'prediction_ruling'
  | 'keep_for_good'
  | 'shift_proposal'
  | 'shift_fading'
  | 'investigation'
  | 'expiry_notice'

export type CallAction =
  | 'approve'
  | 'board_reply'
  | 'schedule'
  | 'mark_published'
  | 'allow_fact_check'
  | 'set_how_sure'
  | 'pick_for_series'
  | 'open_studio_review'
  | 'keep_in_library'
  | 'track_shift'
  | 'close_shift'
  | 'open_investigation'
  | 'open_expiring'

export interface TodaysCall {
  /** Stable across refetches: the kind and the thing it is about. */
  key: string
  kind: CallKind
  cadence: 'daily' | 'weekly'
  title: string
  why: string
  primary: { action: CallAction; label: string }
  secondary: { action: 'not_now'; label: string }
  ideaId?: string
  decisionId?: string
  boardItemId?: string
  reviewId?: string
  series?: string | null
  /** The day this is for, YYYY-MM-DD, where one applies. */
  date?: string
  /** Whether the fact gate was read from the engine or guessed from the
   *  stored result. Only set where a call depends on it. */
  checkedBy?: 'engine' | 'stored'
  /** For a paid fact check: how many sentences it would check fresh. */
  freshSentences?: number | null
}

export interface CallsInput {
  ideas: readonly IdeaInput[]
  /** Pending content_decisions. Null when they could not be read. */
  decisions?: readonly DecisionInput[] | null
  /** Work board items. Null when the board could not be read. */
  boardItems?: readonly BoardItemInput[] | null
  /** The Studio's actionable reviews. Null when they could not be read. */
  videoReviews?: readonly VideoReviewInput[] | null
  /** Engine fact gate reads by idea id, where they were fetched. */
  gates?: GateMap
  formats?: readonly FormatDef[]
  now: Date
  timeZone?: string
}

export interface CallsResult {
  calls: TodaysCall[]
  /** Calls the data cannot support today, each with the reason in words.
   *  Named rather than silently missing, so a gap reads as a gap. */
  unsupported: Array<{ kind: CallKind; why: string }>
  /** Pending items deliberately not turned into calls, and why. */
  leftOut: Array<{ kind: string; count: number; why: string }>
}

/** The most a paid fact check costs, in dollars (content-engine WORKBENCH.md:
 *  "up to 2 dollars, which Krish must approve"). */
export const FACT_CHECK_CAP_USD = 2

const NOT_NOW = { action: 'not_now' as const, label: 'Not now' }

const DAILY_ORDER: CallKind[] = ['approve', 'board', 'go_out', 'allow_fact_check', 'set_how_sure', 'pick_for_series', 'studio_review']
const WEEKLY_ORDER: CallKind[] = ['keep_for_good', 'shift_proposal', 'shift_fading', 'investigation', 'expiry_notice']
const KIND_RANK: Record<string, number> = Object.fromEntries([...DAILY_ORDER, ...WEEKLY_ORDER].map((k, i) => [k, i]))

function quoted(title: string | null | undefined): string {
  const t = (title || '').trim()
  return t ? `"${t}"` : 'this piece'
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** The idea id a board item links to, from a `#/content?idea=<id>` link. */
export function boardItemIdeaId(item: Pick<BoardItemInput, 'link'>): string | null {
  const m = /[?&]idea=([0-9a-f-]{36})/i.exec(item.link || '')
  return m ? m[1]!.toLowerCase() : null
}

/**
 * The decisions that need Krish today, in the order to make them.
 *
 * Daily, closest to going out first: approve a finished piece (and lock it
 * on the board when the board asks for exactly that), anything else the
 * board is waiting on, put an approved piece out, allow a paid fact check,
 * set how sure we are, pick a piece for each series slot with none, review a
 * Studio video. Then the weekly ones, at most once a week: keep a piece for
 * good, rule on a shift, read an investigation, and the expiry notice.
 *
 * Only what the data can support is offered. A call the data cannot back is
 * listed in `unsupported` with the reason, never invented.
 */
export function todaysCalls(input: CallsInput): CallsResult {
  const formats = input.formats ?? SUBCHANNELS
  const gates = input.gates ?? {}
  const calls: TodaysCall[] = []
  const unsupported: CallsResult['unsupported'] = []
  const leftOut: CallsResult['leftOut'] = []
  const seriesOrder = new Map(formats.map(f => [f.slug, f.sort_order]))
  const slots = weekSlots(input.ideas, formats, input.now, { timeZone: input.timeZone, gates })
  const slotFor = new Map(slots.map(s => [s.series, s]))
  const today = calendarDate(input.now, input.timeZone)

  const board = (input.boardItems ?? []).filter(b => b.lane === 'on_you')
  const boardByIdea = new Map<string, BoardItemInput>()
  for (const b of [...board].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0) || byId(x, y))) {
    const ideaId = boardItemIdeaId(b)
    if (ideaId && !boardByIdea.has(ideaId)) boardByIdea.set(ideaId, b)
  }
  const boardUsed = new Set<string>()

  for (const idea of input.ideas) {
    if (idea.buried_at || idea.library_at) continue
    const series = seriesOf(idea)
    const gate = factGateOf(idea, gates[idea.id])
    const title = (idea.idea || '').trim()

    if (idea.state === 'review' || idea.state === 'drafting') {
      if (!hasDraft(idea)) continue
      const sure = howSureOf(idea.body)
      if (!gate.ok) {
        const fresh = gates[idea.id]?.freshSentences ?? null
        const scope = fresh != null ? ` A new check covers ${fresh} sentence${fresh === 1 ? '' : 's'}.` : ''
        calls.push({
          key: `allow_fact_check:${idea.id}`,
          kind: 'allow_fact_check',
          cadence: 'daily',
          title: `Check the facts in ${quoted(title)}`,
          why: (gate.ran
            ? 'The words changed after the last fact check, or it found claims to fix, so it needs checking again.'
            : 'No fact check has run on this draft yet.')
            + `${scope} Each check is paid, up to $${FACT_CHECK_CAP_USD}.`,
          primary: { action: 'allow_fact_check', label: 'Allow the paid check' },
          secondary: NOT_NOW,
          ideaId: idea.id,
          series,
          checkedBy: gate.known ? 'engine' : 'stored',
          freshSentences: fresh,
        })
      }
      if (sure.state === 'unset') {
        calls.push({
          key: `set_how_sure:${idea.id}`,
          kind: 'set_how_sure',
          cadence: 'daily',
          title: `Set how sure we are for ${quoted(title)}`,
          why: 'The prediction waits for your number before the piece can be approved. Only you set it.',
          primary: { action: 'set_how_sure', label: 'Set how sure' },
          secondary: NOT_NOW,
          ideaId: idea.id,
          series,
        })
      }
      // Drafting as well as review: the engine approves from either once the
      // facts and the house checks pass, and a drafting piece whose facts
      // passed is waiting on nobody but him.
      if (gate.ok && sure.state === 'set') {
        const item = boardByIdea.get(idea.id)
        if (item) boardUsed.add(item.id)
        calls.push({
          key: `approve:${idea.id}`,
          kind: 'approve',
          cadence: 'daily',
          title: `Approve ${quoted(title)}`,
          why: `It passed the fact check on these exact words, and how sure we are is ${sure.percent}%. Approving locks this wording for production.`
            + (item ? ' It also answers the board item waiting on you.' : ''),
          primary: { action: 'approve', label: item ? 'Approve and lock' : 'Approve' },
          secondary: NOT_NOW,
          ideaId: idea.id,
          series,
          checkedBy: gate.known ? 'engine' : 'stored',
          ...(item ? { boardItemId: item.id } : {}),
        })
      }
      continue
    }

    if (idea.state === 'approved' && !idea.published_at) {
      const slot = series ? slotFor.get(series) : undefined
      if (idea.scheduled_for && idea.scheduled_for > today) continue
      const due = Boolean(idea.scheduled_for && idea.scheduled_for <= today)
      calls.push({
        key: `go_out:${idea.id}`,
        kind: 'go_out',
        cadence: 'daily',
        title: due ? `Put ${quoted(title)} out` : `Pick a day for ${quoted(title)}`,
        why: due
          ? 'It was due to go out and has not been marked as published.'
          : `Approved and waiting to go out.${slot ? ` Its series goes out on ${slot.weekday}s.` : ''}`,
        primary: due ? { action: 'mark_published', label: 'Mark it published' } : { action: 'schedule', label: 'Pick its day' },
        secondary: NOT_NOW,
        ideaId: idea.id,
        series,
        ...(due ? { date: idea.scheduled_for! } : slot ? { date: slot.date } : {}),
      })
    }
  }

  if (input.boardItems == null) {
    unsupported.push({ kind: 'board', why: 'The work board could not be read, so nothing waiting on you there is shown.' })
  } else {
    for (const item of board) {
      if (boardUsed.has(item.id)) continue
      calls.push({
        key: `board:${item.id}`,
        kind: 'board',
        cadence: 'daily',
        title: item.title,
        why: str(item.detail) ?? 'Waiting on your answer on the work board.',
        primary: { action: 'board_reply', label: str(item.prompt) ?? 'Answer it' },
        secondary: NOT_NOW,
        boardItemId: item.id,
        ...(boardItemIdeaId(item) ? { ideaId: boardItemIdeaId(item)! } : {}),
      })
    }
  }

  for (const slot of slots) {
    if (slot.picked || !slot.candidates.length) continue
    calls.push({
      key: `pick_for_series:${slot.series}:${slot.date}`,
      kind: 'pick_for_series',
      cadence: 'daily',
      title: `Pick ${slot.weekday}'s ${slot.label} piece`,
      why: `${slot.readyCount} judged ready. The best ${slot.candidates.length === 1 ? 'one is' : `${slot.candidates.length} are`} lined up for you.`,
      primary: { action: 'pick_for_series', label: 'Choose one' },
      secondary: NOT_NOW,
      series: slot.series,
      date: slot.date,
    })
  }

  if (input.videoReviews == null) {
    unsupported.push({ kind: 'studio_review', why: 'The Studio review list could not be read.' })
  } else {
    for (const r of input.videoReviews) {
      if (r.status !== 'pending') continue
      calls.push({
        key: `studio_review:${r.id}`,
        kind: 'studio_review',
        cadence: 'daily',
        title: str(r.safe_title) ?? 'A Studio video',
        why: 'A Studio video is waiting for your review.',
        primary: { action: 'open_studio_review', label: 'Open the review' },
        secondary: NOT_NOW,
        reviewId: r.id,
      })
    }
  }

  // Ruling a dated prediction is a real call, and the data cannot carry it
  // from here: nothing in Control Center reads claims_due, and the engine's
  // ruling route (api/claims/rule.ts) takes only its cron secret.
  unsupported.push({
    kind: 'prediction_ruling',
    why: 'Control Center cannot read which predictions are due, and the engine only takes a ruling from its own scheduled jobs.',
  })

  if (input.decisions == null) {
    unsupported.push({ kind: 'keep_for_good', why: 'The weekly decisions could not be read.' })
  } else {
    const current = supersededDecisions(input.decisions)
    const briefs = current.filter(d => d.kind === 'brief_review').length
    if (briefs) {
      leftOut.push({ kind: 'brief_review', count: briefs, why: 'The weekly brief is not one of the calls this tab asks for. It still opens from its own page.' })
    }
    for (const d of current) {
      const p = (d.payload || {}) as Record<string, unknown>
      if (d.kind === 'graduation') {
        calls.push({
          key: `keep_for_good:${d.ref}`,
          kind: 'keep_for_good',
          cadence: 'weekly',
          title: `Keep ${quoted(str(p.title))} for good`,
          why: 'It has held up for weeks. Keep it in the Library, or let it go.',
          primary: { action: 'keep_in_library', label: 'Keep it' },
          secondary: NOT_NOW,
          decisionId: d.id,
          ideaId: d.ref,
        })
      } else if (d.kind === 'shift_proposal') {
        calls.push({
          key: `shift_proposal:${d.ref}`,
          kind: 'shift_proposal',
          cadence: 'weekly',
          title: str(p.title) ?? 'A new pattern the engine spotted',
          why: 'The engine found several stories pointing the same way. Track it as a shift, or say it is not one.',
          primary: { action: 'track_shift', label: 'Track it' },
          secondary: NOT_NOW,
          decisionId: d.id,
        })
      } else if (d.kind === 'shift_fading') {
        calls.push({
          key: `shift_fading:${d.ref}`,
          kind: 'shift_fading',
          cadence: 'weekly',
          title: `${str(p.title) ?? 'A shift you track'} has gone quiet`,
          why: `No new evidence since ${str(p.last_evidence_on) ?? 'a while ago'}. Close it out, or keep watching.`,
          primary: { action: 'close_shift', label: 'Close it out' },
          secondary: NOT_NOW,
          decisionId: d.id,
        })
      } else if (d.kind === 'investigation') {
        calls.push({
          key: `investigation:${d.ref}`,
          kind: 'investigation',
          cadence: 'weekly',
          title: `Investigation ready: ${str(p.anchor_headline) ?? 'this week'}`,
          why: 'The evidence is gathered and waiting for you to read it.',
          primary: { action: 'open_investigation', label: 'Open the evidence' },
          secondary: NOT_NOW,
          decisionId: d.id,
        })
      } else if (d.kind === 'purge_preview') {
        const n = typeof p.expiring === 'number' ? p.expiring : null
        calls.push({
          key: `expiry_notice:${d.week}`,
          kind: 'expiry_notice',
          cadence: 'weekly',
          title: n != null ? `${n} piece${n === 1 ? '' : 's'} go at Monday's clear-out` : "Some pieces go at Monday's clear-out",
          why: 'Nothing to do unless you want to keep one before it goes.',
          primary: { action: 'open_expiring', label: 'See what goes' },
          secondary: NOT_NOW,
          decisionId: d.id,
        })
      }
    }
  }

  const order = (c: TodaysCall) => (c.series ? seriesOrder.get(c.series) ?? 50 : 99)
  calls.sort((a, b) =>
    (KIND_RANK[a.kind] ?? 99) - (KIND_RANK[b.kind] ?? 99)
    || order(a) - order(b)
    || (a.date || '').localeCompare(b.date || '')
    || a.title.localeCompare(b.title)
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  unsupported.sort((a, b) => (KIND_RANK[a.kind] ?? 99) - (KIND_RANK[b.kind] ?? 99) || a.kind.localeCompare(b.kind))
  return { calls, unsupported, leftOut }
}
