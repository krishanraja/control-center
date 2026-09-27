// The strategist's reads: what a read is written from, and the stored read
// the route hands back.
//
// Two halves, kept apart on purpose:
//
//   1. PURE. Request parsing, the allowlisted candidate shape, the counts, the
//      assembly of the grounding from what the database returned, and the
//      shaping of a stored read for the wire (contact details on, then off
//      again before anything is written). Tested in tests/api/strategistRoute
//      .test.ts with no credentials.
//   2. THE LOADERS. loadGoalSubject and loadStrategistGrounding, which import
//      Supabase lazily: `_supabase.ts` throws at module load without service
//      credentials, and so do `_timezone.ts`, `_scorecard.ts` and
//      `_networkSearch.ts`, which all import it at the top.
//
// EVERY PIECE DEGRADES, NOTHING THROWS. A read with the scorecard missing is
// still a read: the grounding prints "no rows" for anything it could not get,
// and the name of what was missing goes back in `degraded`. strategist_reads in
// particular does not exist until migration 20260927100000 is applied; until
// then this week's notes, last week's close and the previous read are read as
// no rows, and `degraded` says so.
//
// WHAT NEVER LEAVES THIS FILE. A candidate carries contact_id, name, title,
// company, tier, roles, who, hook and best channel: nothing else, however much
// the search row holds. why_them and risk are private judgements about named
// people, and a read's rows are learning data. Email and LinkedIn travel
// separately, in ContactDetails, for the one-click contact on the wire only.

import {
  NOTE_MAX_CHARS, WARM_TIERS, incompleteSentence,
  type StrategistGrounding, type StrategistCandidate, type CanonGoal, type ScoreKey, type ScoreValues,
} from './_strategist.js'
import { describeDbError, type DbErrorLike } from './_suggestions.js'
import type {
  NoteKind, StrategistRequest, StrategistRead, StrategistSection, AskSection, AskPerson,
  StrategistReadWire, StrategistSource, ReadStatus,
} from '../src/types/strategist.js'

// ── Constants ────────────────────────────────────────────────────────────────

/** The three roles a strategist read looks for in the warm network. */
export const CANDIDATE_ROLES = ['partner', 'introducer', 'investor'] as const
export type CandidateRole = (typeof CANDIDATE_ROLES)[number]

/** Six per role: enough to choose from, few enough to read. */
export const CANDIDATES_PER_ROLE = 6

/** This week's earlier notes the model sees, newest kept, and how much of each. */
export const WEEK_NOTES_KEPT = 6
export const WEEK_NOTE_CHARS = 3000

const NOTE_KINDS: readonly NoteKind[] = ['week_open', 'update', 'week_close']
const SCORE_KEYS: readonly ScoreKey[] = [
  'approaches_sent', 'calls_taken', 'paid_pilots', 'cash_invoiced_gbp', 'pieces_published', 'unasked_hours',
]

// ── The request ──────────────────────────────────────────────────────────────

export type ParsedStrategistRequest =
  | { ok: true; request: StrategistRequest }
  | { ok: false; error: string; detail: string }

/**
 * The POST body, checked before anything is written or run. Refusals carry a
 * code and a plain sentence; the route answers them as 400 JSON, before the
 * stream opens.
 */
export function parseStrategistRequest(body: unknown): ParsedStrategistRequest {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const tz = typeof b.tz === 'string' && b.tz.trim() ? b.tz.trim() : undefined
  if (b.source === 'goal') {
    const goalId = typeof b.goalId === 'string' ? b.goalId.trim() : ''
    if (!goalId || goalId.length > 200) {
      return { ok: false, error: 'goal_required', detail: 'Say which goal to read.' }
    }
    return { ok: true, request: { source: 'goal', goalId, ...(tz ? { tz } : {}) } }
  }
  if (b.source === 'note') {
    if (!NOTE_KINDS.includes(b.kind as NoteKind)) {
      return {
        ok: false,
        error: 'unknown_note_kind',
        detail: 'Say whether this is the start of the week, progress during it, or how the week went.',
      }
    }
    const text = typeof b.body === 'string' ? b.body.trim() : ''
    if (!text) return { ok: false, error: 'note_required', detail: 'There is nothing in the note yet.' }
    if (text.length > NOTE_MAX_CHARS) {
      return {
        ok: false,
        error: 'note_too_long',
        detail: 'That note is longer than 12,000 characters. Send it in two parts.',
      }
    }
    return { ok: true, request: { source: 'note', kind: b.kind as NoteKind, body: text, ...(tz ? { tz } : {}) } }
  }
  return { ok: false, error: 'source_required', detail: 'Send a goal to read or a note.' }
}

// ── Database errors ──────────────────────────────────────────────────────────

/** True when the error is the table not existing yet (migration unapplied). */
export function isMissingTable(e: DbErrorLike | null | undefined): boolean {
  return !!e && describeDbError(e).startsWith('table_missing')
}

// ── Pure pieces of the grounding ─────────────────────────────────────────────

/**
 * Search rows to candidates, from an allowlist of fields. Warm tiers only,
 * each person once (the first role that found them wins the slot), and
 * nothing private: a row's why_them, risk, email and everything else the
 * search returns are never copied.
 */
export function candidatesFrom(lists: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>): StrategistCandidate[] {
  const out: StrategistCandidate[] = []
  const seen = new Set<string>()
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  for (const list of lists) {
    for (const r of list || []) {
      const id = str(r?.contact_id)
      const tier = str(r?.network_tier)
      if (!id || !tier || seen.has(id)) continue
      if (!(WARM_TIERS as readonly string[]).includes(tier)) continue
      seen.add(id)
      out.push({
        contact_id: id,
        full_name: str(r.full_name),
        title: str(r.title),
        company: str(r.company),
        network_tier: tier,
        roles: Array.isArray(r.roles) ? r.roles.filter((x): x is string => typeof x === 'string') : [],
        who: str(r.who),
        hook: str(r.hook),
        best_channel: str(r.best_channel),
      })
    }
  }
  return out
}

export interface ContactDetail {
  email: string | null
  linkedin_url: string | null
}

/** contact_id to the two fields one-click contact needs. Never persisted. */
export type ContactDetails = Record<string, ContactDetail>

/** The contact details the search rows carried, by contact_id. Accepts either
 *  search rows (contact_id) or contacts rows (id). */
export function contactDetailsFrom(rows: ReadonlyArray<Record<string, unknown>>): ContactDetails {
  const out: ContactDetails = {}
  for (const r of rows || []) {
    const id = typeof r?.contact_id === 'string' ? r.contact_id : typeof r?.id === 'string' ? r.id : ''
    if (!id || out[id]) continue
    out[id] = {
      email: typeof r.email === 'string' && r.email.trim() ? r.email.trim() : null,
      linkedin_url: typeof r.linkedin_url === 'string' && r.linkedin_url.trim() ? r.linkedin_url.trim() : null,
    }
  }
  return out
}

/** pilot_deals rows counted by state, in first-seen order. */
export function dealCounts(rows: ReadonlyArray<{ state?: unknown }> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows || []) {
    const s = typeof r?.state === 'string' && r.state ? r.state : null
    if (s) out[s] = (out[s] || 0) + 1
  }
  return out
}

/** Today's pilot_asks row, as whether it exists, whether it went, and how it landed. */
export function todayAskFrom(row: { sent_at?: unknown; outcome?: unknown } | null | undefined): NonNullable<StrategistGrounding['today_ask']> {
  if (!row) return { exists: false, sent: false, outcome: null }
  return {
    exists: true,
    sent: !!row.sent_at,
    outcome: typeof row.outcome === 'string' && row.outcome ? row.outcome : null,
  }
}

export interface StoredReadRow {
  id: string
  created_at: string
  source: StrategistSource | string
  goal_id?: string | null
  note_kind?: string | null
  note_body?: string | null
  week_start: string
  status: ReadStatus | string
  sections?: unknown
  headline?: string | null
  last_attempt_at?: string | null
}

/**
 * This week's earlier notes, oldest first, the newest WEEK_NOTES_KEPT of them.
 * The note being read now is excluded by id. A note whose read failed is still
 * what he said, so status does not filter; the headline rides along only when
 * the read completed. Each body is cut at WEEK_NOTE_CHARS and says it was cut.
 */
export function weekNotesFrom(
  rows: ReadonlyArray<StoredReadRow> | null | undefined,
  excludeId: string | null | undefined,
  at: (iso: string) => string,
): StrategistGrounding['week_notes'] {
  const notes = (rows || [])
    .filter(r => r && r.id !== excludeId && NOTE_KINDS.includes(r.note_kind as NoteKind))
    .filter(r => typeof r.note_body === 'string' && r.note_body.trim())
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-WEEK_NOTES_KEPT)
  return notes.map(r => {
    const body = (r.note_body as string).trim()
    return {
      kind: r.note_kind as NoteKind,
      at: at(r.created_at),
      body: body.length > WEEK_NOTE_CHARS ? `${body.slice(0, WEEK_NOTE_CHARS)} [the rest of this note is cut here]` : body,
      headline: r.status === 'complete' && r.headline ? r.headline : null,
    }
  })
}

function sectionsOf(v: unknown): Partial<StrategistRead> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Partial<StrategistRead> : null
}

/** Last week's close read: its headline and its learning line. */
export function lastWeekCloseFrom(row: StoredReadRow | null | undefined): StrategistGrounding['last_week_close'] {
  if (!row) return null
  const learning = sectionsOf(row.sections)?.learning
  const text = learning && typeof learning.text === 'string' ? learning.text : null
  if (!row.headline && !text) return null
  return { headline: row.headline ?? null, learning: text }
}

/** The last complete read of the same goal, so its asks are not repeated. */
export function previousReadFrom(row: StoredReadRow | null | undefined, at: (iso: string) => string): StrategistGrounding['previous_read'] {
  if (!row) return null
  const asks = sectionsOf(row.sections)?.asks
  return {
    at: at(row.created_at),
    headline: row.headline ?? null,
    asks: Array.isArray(asks) ? asks.map(a => (a && typeof a.line === 'string' ? a.line : '')).filter(Boolean) : [],
  }
}

export interface GoalSubject extends CanonGoal {
  parent_title: string | null
}

/**
 * The canon a read may cite: the active goals, plus the goal being read when
 * it is not active yet (a proposed or paused goal is still the subject, and an
 * objective drafted from it has to be able to serve it).
 */
export function canonFrom(
  spine: ReadonlyArray<{ id: string; title: string; horizon: string; job?: string | null; parent_id?: string | null; is_stale?: boolean }> | null | undefined,
  subject: GoalSubject | null,
): CanonGoal[] {
  const canon: CanonGoal[] = []
  for (const g of spine || []) {
    if (g.horizon !== 'os' && g.horizon !== 'weekly') continue
    canon.push({
      id: g.id, title: g.title, horizon: g.horizon, status: 'active',
      job: g.job ?? null, parent_id: g.parent_id ?? null, is_stale: !!g.is_stale,
    })
  }
  if (subject && !canon.some(c => c.id === subject.id)) {
    canon.push({
      id: subject.id, title: subject.title, horizon: subject.horizon, status: subject.status ?? null,
      job: subject.job ?? null, parent_id: subject.parent_id ?? null,
    })
  }
  return canon
}

/** The six scorecard columns and nothing else from a derived week. */
export function pickScores(v: Record<string, unknown> | null | undefined): ScoreValues {
  const out: ScoreValues = {}
  for (const k of SCORE_KEYS) {
    const n = v ? Number(v[k]) : NaN
    if (v && v[k] != null && Number.isFinite(n)) out[k] = n
  }
  return out
}

export interface GroundingParts {
  today: string
  tz: string
  week_start: string
  subject: StrategistGrounding['subject']
  /** goalsSpine().spine, or null when it could not be read. */
  spine: {
    all: ReadonlyArray<{ id: string; title: string; horizon: string; job?: string | null; parent_id?: string | null; is_stale?: boolean }>
    today: ReadonlyArray<{ slot: number; text: string; done: boolean; goal_id: string | null }>
  } | null
  scorecard: {
    week_ending: string
    current: Record<string, unknown>
    totals: Record<string, unknown>
    gap: Record<string, unknown>
  } | null
  targets: Record<string, unknown> | null
  stop_rule: { on: string; reads: string }
  deal_rows: ReadonlyArray<{ state?: unknown }> | null
  /** Today's pilot_asks row; undefined when it could not be read. */
  today_ask_row: { sent_at?: unknown; outcome?: unknown } | null | undefined
  week_rows: ReadonlyArray<StoredReadRow> | null
  last_close_row: StoredReadRow | null
  previous_row: StoredReadRow | null
  exclude_read_id: string | null
  network_counts: Record<string, number> | null
  search_lists: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>
  /** How a stored timestamp is written for the model: a civil date in tz. */
  at: (iso: string) => string
}

/**
 * The grounding from whatever the loaders got. Anything null prints as "no
 * rows" when renderGroundingText draws it, never as a zero or a guess.
 */
export function assembleGrounding(p: GroundingParts): StrategistGrounding {
  const subjectGoal = p.subject.source === 'goal'
    ? { ...p.subject.goal, parent_title: p.subject.goal.parent_title ?? null } as GoalSubject
    : null
  return {
    today: p.today,
    tz: p.tz,
    week_start: p.week_start,
    subject: p.subject,
    canon: canonFrom(p.spine?.all, subjectGoal),
    today_picks: (p.spine?.today || []).map(t => ({ slot: t.slot, text: t.text, done: t.done, goal_id: t.goal_id ?? null })),
    scorecard: p.scorecard
      ? {
          week_ending: p.scorecard.week_ending,
          current: pickScores(p.scorecard.current),
          totals: pickScores(p.scorecard.totals),
          gap: pickScores(p.scorecard.gap),
          targets: pickScores(p.targets),
        }
      : null,
    stop_rule: { on: p.stop_rule.on, reads: p.stop_rule.reads },
    pilot_deals: p.deal_rows ? dealCounts(p.deal_rows) : null,
    today_ask: p.today_ask_row === undefined ? null : todayAskFrom(p.today_ask_row),
    week_notes: weekNotesFrom(p.week_rows, p.exclude_read_id, p.at),
    last_week_close: lastWeekCloseFrom(p.last_close_row),
    previous_read: p.subject.source === 'goal' ? previousReadFrom(p.previous_row, p.at) : null,
    network_counts: p.network_counts,
    candidates: candidatesFrom(p.search_lists),
  }
}

// ── The wire: contact details on for Krish, off for storage ──────────────────

function isRead(v: unknown): v is StrategistRead {
  const r = sectionsOf(v)
  return !!r && r.v === 1 && !!r.headline && !!r.close && Array.isArray(r.asks)
}

/** Every contact id a read's asks point at: named people and introducers. */
export function askContactIds(read: StrategistRead | null | undefined): string[] {
  const ids = new Set<string>()
  for (const a of read?.asks || []) {
    if (a?.to?.kind === 'named') ids.add(a.to.person.contact_id)
    else if (a?.to?.kind === 'role' && a.to.via.kind === 'contact') ids.add(a.to.via.person.contact_id)
  }
  return [...ids]
}

/** A person rebuilt from an allowlist, so nothing rides along by accident;
 *  with details, the two contact fields are added (null when unknown). */
function personWith(p: AskPerson, details: ContactDetails | null): AskPerson {
  const base: AskPerson = {
    contact_id: p.contact_id,
    name: p.name,
    title: p.title ?? null,
    company: p.company ?? null,
    best_channel: p.best_channel ?? null,
  }
  if (!details) return base
  const d = details[p.contact_id]
  return { ...base, email: d?.email ?? null, linkedin_url: d?.linkedin_url ?? null }
}

function askWith(a: AskSection, details: ContactDetails | null): AskSection {
  if (a.to.kind === 'named') return { ...a, to: { kind: 'named', person: personWith(a.to.person, details) } }
  if (a.to.via.kind === 'contact') {
    return { ...a, to: { ...a.to, via: { kind: 'contact', person: personWith(a.to.via.person, details) } } }
  }
  return a
}

/** One section with contact details attached (asks only; others pass through). */
export function sectionWithContacts(s: StrategistSection, details: ContactDetails): StrategistSection {
  return s.kind === 'ask' ? askWith(s, details) : s
}

/** The read as Krish sees it: every ask's person carries email and LinkedIn. */
export function withContacts(read: StrategistRead, details: ContactDetails): StrategistRead {
  return { ...read, asks: read.asks.map(a => askWith(a, details)) }
}

/** The read as it is stored: no contact details anywhere, whatever came in. */
export function withoutContacts(read: StrategistRead): StrategistRead {
  return { ...read, asks: read.asks.map(a => askWith(a, null)) }
}

/**
 * One stored row as GET returns it. The read is present only when the row is
 * complete and its sections have the shape of a read; the note itself is never
 * sent back (there is no archive, and the draft lives on his device).
 */
export function readWireFrom(row: StoredReadRow, details: ContactDetails = {}): StrategistReadWire {
  const complete = row.status === 'complete' && isRead(row.sections)
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    source: row.source === 'goal' ? 'goal' : 'note',
    goal_id: row.goal_id ?? null,
    note_kind: NOTE_KINDS.includes(row.note_kind as NoteKind) ? row.note_kind as NoteKind : null,
    week_start: String(row.week_start),
    status: row.status === 'complete' || row.status === 'incomplete' ? row.status : 'pending',
    headline: row.headline ?? null,
    read: complete ? withContacts(row.sections as StrategistRead, details) : null,
    last_attempt_at: String(row.last_attempt_at ?? row.created_at),
  }
}

// ── A read that did not finish, in plain words ───────────────────────────────

export type ReadFailure = 'timed_out' | 'anthropic_failed' | 'incomplete' | 'unexpected'

/**
 * The in-band error for a read that did not finish: a code the client can
 * branch on and a sentence Krish can read. Never the provider's text, which
 * can carry a secret's name; that goes to console.warn and nowhere else.
 */
export function readFailureEvent(
  failure: ReadFailure,
  reasons: string[],
  source: StrategistSource,
): { error: 'strategist_read_incomplete' | 'anthropic_failed' | 'timed_out'; detail: string } {
  const kept = source === 'note'
    ? 'What you said is kept, and you can run it again.'
    : 'Nothing was saved, and you can run it again.'
  if (failure === 'timed_out') {
    return { error: 'timed_out', detail: `The read took too long and was stopped. ${kept}` }
  }
  if (failure === 'anthropic_failed') {
    return { error: 'anthropic_failed', detail: `The model did not answer, so there is no read this time. ${kept}` }
  }
  if (failure === 'unexpected') {
    return { error: 'strategist_read_incomplete', detail: `Something went wrong while writing the read. ${kept}` }
  }
  return { error: 'strategist_read_incomplete', detail: incompleteSentence(reasons, source) }
}

// ── The loaders (lazy Supabase) ──────────────────────────────────────────────

export type GoalSubjectResult =
  | { ok: true; goal: GoalSubject }
  | { ok: false; status: 400 | 404 | 500; error: string; detail: string }

/**
 * The goal a read is about, with its parent's title. Answered before the
 * stream opens, so a goal that does not exist is a 404 and not an in-band
 * error. A dropped goal is not read: it steers nothing.
 */
export async function loadGoalSubject(goalId: string): Promise<GoalSubjectResult> {
  const { supabase } = await import('./_supabase.js')
  const { data, error } = await supabase
    .from('goals')
    .select('id, title, horizon, status, job, parent_id')
    .eq('id', goalId)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: 'goal_read_failed', detail: 'The goal could not be read. Try again.' }
  const g = data as Record<string, unknown> | null
  if (!g) return { ok: false, status: 404, error: 'goal_not_found', detail: 'That goal is not on the ladder.' }
  if (g.status === 'dropped') {
    return { ok: false, status: 400, error: 'goal_dropped', detail: 'That goal was dropped, so there is nothing to read.' }
  }
  if (g.horizon !== 'os' && g.horizon !== 'weekly') {
    return { ok: false, status: 400, error: 'unsupported_horizon', detail: 'Only the OS goal and weekly objectives can be read.' }
  }
  let parentTitle: string | null = null
  if (typeof g.parent_id === 'string' && g.parent_id) {
    const p = await supabase.from('goals').select('title').eq('id', g.parent_id).maybeSingle()
    parentTitle = typeof (p.data as { title?: unknown } | null)?.title === 'string' ? (p.data as { title: string }).title : null
  }
  return {
    ok: true,
    goal: {
      id: String(g.id),
      title: String(g.title || ''),
      horizon: g.horizon,
      status: typeof g.status === 'string' ? g.status : null,
      job: typeof g.job === 'string' ? g.job : null,
      parent_id: typeof g.parent_id === 'string' ? g.parent_id : null,
      parent_title: parentTitle,
    },
  }
}

export type GroundingInput =
  | { source: 'goal'; goal: GoalSubject }
  | { source: 'note'; kind: NoteKind; body: string }

export interface LoadedGrounding {
  grounding: StrategistGrounding
  /** Email and LinkedIn for the candidates, for the wire only. */
  contacts: ContactDetails
  /** What could not be read, by name. Empty when everything was there. */
  degraded: string[]
}

type Result<T> = { data: T | null; error: DbErrorLike | null; count?: number | null }

/**
 * Everything a read is written from, in parallel. `today` and `weekStart` come
 * from the route, so the row it wrote and the grounding it reads agree on the
 * week; `excludeReadId` is that row, which must not read as an earlier note.
 */
export async function loadStrategistGrounding(
  input: GroundingInput,
  tz: string,
  opts: { today: string; weekStart: string; excludeReadId?: string | null },
): Promise<LoadedGrounding> {
  const degraded: string[] = []
  const note = (name: string, detail?: string) => {
    if (degraded.includes(name)) return
    degraded.push(name)
    if (detail) console.warn(`strategist_grounding ${name}: ${detail}`)
  }

  const [{ supabase }, { goalsSpine }, scorecard, { runNetworkSearch }, { ymdIn, shiftYmd }] = await Promise.all([
    import('./_supabase.js'),
    import('./_goals.js'),
    import('./_scorecard.js'),
    import('./_networkSearch.js'),
    import('./_timezone.js'),
  ])

  const at = (iso: string): string => {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return String(iso)
    const ymd = ymdIn(d, tz)
    const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(d)
    return `${day} ${ymd}`
  }

  /** A supabase read that cannot throw, and that names what it lost. */
  const read = async <T>(name: string, q: PromiseLike<Result<T>>, tableIsNew = false): Promise<Result<T>> => {
    try {
      const r = await q
      if (r.error) {
        if (tableIsNew && isMissingTable(r.error)) {
          note('strategist_reads_missing', 'the table does not exist yet (migration 20260927100000 is not applied); earlier notes, last week\'s close and the previous read are read as no rows')
        } else {
          note(`${name}_unavailable`, describeDbError(r.error))
        }
        return { data: null, error: r.error }
      }
      return r
    } catch (e) {
      note(`${name}_unavailable`, (e as Error)?.message || String(e))
      return { data: null, error: { message: (e as Error)?.message || String(e) } }
    }
  }

  const subjectGoalId = input.source === 'goal' ? input.goal.id : null

  const searchFor = async (role: CandidateRole): Promise<Array<Record<string, unknown>>> => {
    try {
      const out = await runNetworkSearch({
        plan: {
          restated: `The warm ${role}s in your network.`,
          // Empty: no embedding and no lexical tier, so the search takes the
          // bounded relationship path and answers in well under a second.
          semantic_query: '',
          keywords: '',
          venture: 'mindmake',
          constraints: [],
        },
        venture: 'mindmake',
        roles: [role],
        tiers: [...WARM_TIERS],
        filterMode: 'hard',
        limit: CANDIDATES_PER_ROLE,
        rerank: false,
      })
      return out.results as unknown as Array<Record<string, unknown>>
    } catch (e) {
      note(`network_${role}_unavailable`, (e as Error)?.message || String(e))
      return []
    }
  }

  const countFor = async (role: CandidateRole): Promise<number | null> => {
    const r = await read<unknown>(`network_count_${role}`, supabase
      .from('contact_intelligence')
      .select('contact_id', { count: 'exact', head: true })
      .contains('roles', [role])
      .in('network_tier', [...WARM_TIERS])
      .eq('is_person', true)
      .neq('intel_method', 'rules_v1') as unknown as PromiseLike<Result<unknown>>)
    return r.error || typeof r.count !== 'number' ? null : r.count
  }

  const [spineR, scoreR, dealsR, askR, weekR, closeR, prevR, counts, lists] = await Promise.all([
    goalsSpine('reading a goal or a note as his strategist')
      .then(s => s.spine)
      .catch((e: unknown) => { note('goals_unavailable', (e as Error)?.message || String(e)); return null }),
    scorecard.scorecardToDate(tz)
      .catch((e: unknown) => { note('scorecard_unavailable', (e as Error)?.message || String(e)); return null }),
    read<Array<{ state: string }>>('pilot_deals', supabase.from('pilot_deals').select('state') as unknown as PromiseLike<Result<Array<{ state: string }>>>),
    read<{ sent_at: string | null; outcome: string | null }>('pilot_asks', supabase
      .from('pilot_asks').select('sent_at, outcome').eq('ask_date', opts.today).maybeSingle() as unknown as PromiseLike<Result<{ sent_at: string | null; outcome: string | null }>>),
    read<StoredReadRow[]>('week_notes', supabase
      .from('strategist_reads')
      .select('id, created_at, note_kind, note_body, headline, status, week_start, source')
      .eq('source', 'note')
      .eq('week_start', opts.weekStart)
      .order('created_at', { ascending: false })
      .limit(WEEK_NOTES_KEPT + 1) as unknown as PromiseLike<Result<StoredReadRow[]>>, true),
    read<StoredReadRow>('last_week_close', supabase
      .from('strategist_reads')
      .select('id, created_at, headline, sections, status, week_start, source')
      .eq('source', 'note')
      .eq('note_kind', 'week_close')
      .eq('status', 'complete')
      .eq('week_start', shiftYmd(opts.weekStart, -7))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as PromiseLike<Result<StoredReadRow>>, true),
    subjectGoalId
      ? read<StoredReadRow>('previous_read', supabase
          .from('strategist_reads')
          .select('id, created_at, headline, sections, status, week_start, source')
          .eq('goal_id', subjectGoalId)
          .eq('status', 'complete')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle() as unknown as PromiseLike<Result<StoredReadRow>>, true)
      : Promise.resolve({ data: null, error: null } as Result<StoredReadRow>),
    Promise.all(CANDIDATE_ROLES.map(countFor)),
    Promise.all(CANDIDATE_ROLES.map(searchFor)),
  ])

  const networkCounts: Record<string, number> = {}
  CANDIDATE_ROLES.forEach((role, i) => { if (typeof counts[i] === 'number') networkCounts[role] = counts[i] as number })

  const grounding = assembleGrounding({
    today: opts.today,
    tz,
    week_start: opts.weekStart,
    subject: input.source === 'goal'
      ? { source: 'goal', goal: input.goal }
      : { source: 'note', kind: input.kind, body: input.body },
    spine: spineR,
    scorecard: scoreR as GroundingParts['scorecard'],
    targets: scorecard.TARGETS as unknown as Record<string, unknown>,
    stop_rule: scorecard.STOP_RULE,
    deal_rows: dealsR.error ? null : (dealsR.data || []),
    today_ask_row: askR.error ? undefined : askR.data,
    week_rows: weekR.data,
    last_close_row: closeR.data,
    previous_row: prevR.data,
    exclude_read_id: opts.excludeReadId ?? null,
    network_counts: Object.keys(networkCounts).length ? networkCounts : null,
    search_lists: lists,
    at,
  })

  return { grounding, contacts: contactDetailsFrom(lists.flat()), degraded }
}

/**
 * Email and LinkedIn for a stored read's people, read from contacts at the
 * moment the read is shown. Never stored with the read. A failure attaches
 * nulls rather than failing the read.
 */
export async function loadContactDetails(ids: string[]): Promise<ContactDetails> {
  if (!ids.length) return {}
  try {
    const { supabase } = await import('./_supabase.js')
    const { data, error } = await supabase.from('contacts').select('id, email, linkedin_url').in('id', ids)
    if (error) {
      console.warn(`strategist_contacts_unavailable: ${describeDbError(error)}`)
      return {}
    }
    return contactDetailsFrom((data || []) as Array<Record<string, unknown>>)
  } catch (e) {
    console.warn(`strategist_contacts_unavailable: ${(e as Error)?.message || String(e)}`)
    return {}
  }
}
