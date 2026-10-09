import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { guard } from './_auth.js'
import { openStream, send, streamClaude } from './_stream.js'
import { SYNTHESIS_MODEL } from './_models.js'
import { resolveTz, ymdIn, weekOfIn } from './_timezone.js'
import { targetWeekStartIn } from './_week.js'
import {
  STRATEGIST_AGENT, STRATEGIST_PERSONA, STRATEGIST_PROMPT_REV,
  buildStrategistSystem, buildStrategistUser, buildValidationCtx, createReadAccumulator, createLineSplitter,
  readShapeFor, thinksFor, suggestionRowsFor, stampSuggestionIds,
} from './_strategist.js'
import {
  parseStrategistRequest, loadGoalSubject, loadStrategistGrounding, loadContactDetails,
  readWireFrom, askContactIds, sectionWithContacts, withContacts, withoutContacts,
  isMissingTable, readFailureEvent,
  type GoalSubject, type GroundingInput, type StoredReadRow, type ReadFailure,
} from './_strategistGrounding.js'
import { recordSuggestions, describeDbError } from './_suggestions.js'
import { startWalkthrough } from './_walkthrough.js'
import type {
  StrategistRequest, StrategistStage, StrategistGetResponse, StrategistDoneEvent, StrategistErrorEvent,
  StrategistSectionEvent, StrategistRead, ReadStatus, StrategistReadWire, AskPerson,
} from '../src/types/strategist.js'

/**
 * /api/strategist
 *
 * Krish, 2026-09-27: "If I enter a goal, the tool should actively act like a
 * world class strategy consultant", and "I could just talk into a regular text
 * box ... The system could turn that into recommendations, goals, next steps".
 *
 * GET  ?goalId=<id>      the latest complete read of that goal
 *      ?week=current     the latest complete read of a note this week
 *      Only ever the latest (no archive, FOCUS-PURPOSE constraint 1), plus the
 *      latest attempt of any status, so the client can back off for a day
 *      after a failure instead of spending again on every open.
 *
 * POST { source: 'goal', goalId }                     read a goal
 *      { source: 'note', kind, body }                 read what he said
 *      Streams server-sent events:
 *        : ping           every 10s, because a thinking model streams nothing
 *                         while it thinks and the client gives up after 90s of
 *                         silence
 *        stage   { stage }             grounding, thinking, writing, saving
 *        section { index, section }    one validated line, as it passes
 *        done    { read_id, suggestion_ids, persisted, read, notes }
 *        error   { error, detail, read_id }   a plain sentence, never provider text
 *
 * THE ORDER IS THE GUARANTEE. The row is written as pending BEFORE the model
 * runs, so a read that fails never loses what he said. Until migration
 * 20260927100000 is applied there is no table to write to: the read still
 * streams, done says persisted: false, and nothing reruns by itself. After the
 * stream opens nothing answers 500; every failure is in-band.
 *
 * WHAT IT NEVER DOES. It never sends anything, never writes a goal (a drafted
 * objective becomes a goal only when he taps Take it, through the ritual and
 * the goal gate), never fills his prediction, and never stores contact
 * details: email and LinkedIn are attached to the wire copy for one-click
 * contact and stripped before anything is written. audit_log gets the event
 * type and the read id, nothing he said. Provider errors go to console.warn.
 *
 * Guarded on both methods: middleware.ts does not gate /api/*, and a read
 * names warm contacts and quotes his notes.
 *
 * Model: SYNTHESIS_MODEL, stamped goal-strategist, from one of two literal call
 * sites (a ternary would hide the stamp from check-agent-stamps and the
 * thinking flag from check-model-routing). The OS goal, a Monday note and a
 * week's close think (20000 tokens at medium effort: adaptive thinking spends
 * max_tokens before it writes, and at 12000 with no effort a full Monday note
 * spent the lot and stopped mid-read on 2026-10-07. 20000 streams in about
 * 220s, inside DEADLINE_MS). A weekly objective and a mid-week update do not
 * (4000: an update's battle plan carries up to eight timed steps). No
 * temperature: thinking reads it as an error.
 */

export const config = { maxDuration: 300 }

/** The model gets this long. The rescue provider has no deadline of its own,
 *  and maxDuration is 300s, so this leaves a minute to save and say so. */
const DEADLINE_MS = 240_000
const PING_MS = 10_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET', 'POST'])) return
  if (req.method === 'GET') return get(req, res)
  return post(req, res)
}

// ── GET: the latest read ─────────────────────────────────────────────────────

const WIRE_COLUMNS = 'id, created_at, source, goal_id, note_kind, week_start, status, sections, headline, last_attempt_at'

async function get(req: VercelRequest, res: VercelResponse) {
  const q = (req.query || {}) as Record<string, unknown>
  const goalId = typeof q.goalId === 'string' ? q.goalId.trim() : ''
  const week = q.week === 'current'
  if (q.daily === 'today') return getDaily(res)
  if (!goalId && !week) {
    return res.status(400).json({ ok: false, error: 'goal_or_week_required', detail: 'Ask for a goal or for this week.' })
  }

  // One filter, applied to both reads: the latest complete read and the
  // latest attempt of any status.
  let weeks: string[] = []
  if (!goalId) {
    const tz = await resolveTz(req)
    const now = new Date()
    // On a weekend a Monday note may already be filed under next week.
    weeks = [...new Set([weekOfIn(now, tz), targetWeekStartIn(now, tz)])]
  }
  const scoped = (columns: string) => {
    const base = supabase.from('strategist_reads').select(columns)
    return goalId ? base.eq('goal_id', goalId) : base.eq('source', 'note').in('week_start', weeks)
  }

  const [completeR, attemptR] = await Promise.all([
    scoped(WIRE_COLUMNS).eq('status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    scoped('status, last_attempt_at').order('last_attempt_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const empty: StrategistGetResponse = { ok: true, read: null, last_attempt_at: null, last_status: null }
  const firstError = completeR.error || attemptR.error
  if (firstError) {
    // Before the migration there is nothing to read, which is not a failure.
    if (isMissingTable(firstError)) return res.json(empty)
    return res.status(500).json({ ok: false, error: 'read_failed', detail: describeDbError(firstError) })
  }

  const row = completeR.data as unknown as StoredReadRow | null
  const attempt = attemptR.data as unknown as { status: ReadStatus; last_attempt_at: string } | null
  let wire = row ? readWireFrom(row) : null
  if (wire?.read) {
    const details = await loadContactDetails(askContactIds(wire.read))
    wire = { ...wire, read: withContacts(wire.read, details) }
  }
  const body: StrategistGetResponse = {
    ok: true,
    read: wire,
    last_attempt_at: attempt?.last_attempt_at ?? null,
    last_status: attempt?.status ?? null,
  }
  return res.json(body)
}

// ── GET ?daily=today: the morning's move (ADR-028) ───────────────────────────

/**
 * Today's daily read, with what he has already done with each item and the
 * people and draft links attached fresh, never stored. Today is the
 * operator-civil date the cron wrote it for, not the browser's: a read written
 * in New York at five is today's read wherever he opens it.
 */
async function getDaily(res: VercelResponse) {
  const { getOperatorTz } = await import('./_timezone.js')
  const today = ymdIn(new Date(), await getOperatorTz())
  const cols = `${WIRE_COLUMNS}, read_date`
  const [completeR, attemptR] = await Promise.all([
    supabase.from('strategist_reads').select(cols).eq('source', 'daily').eq('read_date', today)
      .eq('status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('strategist_reads').select('status, last_attempt_at').eq('source', 'daily').eq('read_date', today)
      .order('last_attempt_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const empty: StrategistGetResponse = { ok: true, read: null, last_attempt_at: null, last_status: null }
  const firstError = completeR.error || attemptR.error
  if (firstError) {
    // Before migration 20261003120000 there is no read_date to ask for and no
    // daily read can exist, which is not a failure.
    if (isMissingTable(firstError) || /read_date/.test(firstError.message || '')) return res.json(empty)
    return res.status(500).json({ ok: false, error: 'read_failed', detail: describeDbError(firstError) })
  }
  const row = completeR.data as unknown as StoredReadRow | null
  const attempt = attemptR.data as unknown as { status: ReadStatus; last_attempt_at: string } | null
  let wire = row ? readWireFrom(row) : null
  if (wire?.read) {
    const read = wire.read
    const ids = [...read.next_steps, ...read.asks].map(x => x.suggestion_id).filter((x): x is string => !!x)
    const contactIds = read.next_steps.map(m => m.contact_id).filter((x): x is string => !!x)
    const dealIds = read.next_steps.map(m => m.pilot_deal_id).filter((x): x is string => !!x)
    const { loadStepOutcomes } = await import('./_walkthrough.js')
    const [answered, people, drafts, details, stepOutcomes, dealStates] = await Promise.all([
      loadAnswered(ids),
      loadPeople(contactIds),
      loadDraftLinks(dealIds),
      loadContactDetails(askContactIds(read)),
      loadStepOutcomes(ids),
      loadDealStates(dealIds),
    ])
    // What happened to each move (ADR-030): the ledger first, and for a move
    // about a drafted approach, the deal's own ladder. Sent or beyond is the
    // honest did_it; it never overrides a ledger row that says more.
    const outcomes: NonNullable<StrategistReadWire['outcomes']> = { ...stepOutcomes }
    for (const m of read.next_steps) {
      if (!m.suggestion_id || outcomes[m.suggestion_id] || !m.pilot_deal_id) continue
      if (dealStates[m.pilot_deal_id] && DEAL_SENT_OR_BEYOND.has(dealStates[m.pilot_deal_id])) {
        outcomes[m.suggestion_id] = { outcome: 'did_it', artifact: null }
      }
    }
    wire = {
      ...wire,
      answered,
      outcomes,
      read: {
        ...withContacts(read, details),
        next_steps: read.next_steps.map(m => ({
          ...m,
          person: m.contact_id ? people[m.contact_id] ?? null : null,
          draft_url: m.pilot_deal_id ? drafts[m.pilot_deal_id] ?? null : null,
        })),
      },
    }
  }
  const body: StrategistGetResponse = {
    ok: true,
    read: wire,
    last_attempt_at: attempt?.last_attempt_at ?? null,
    last_status: attempt?.status ?? null,
  }
  return res.json(body)
}

type Answer = NonNullable<StrategistReadWire['answered']>[string]
const ANSWERS = new Set(['accepted', 'rejected', 'deferred', 'replaced', 'tweaked'])

/** The latest verdict on each item, by suggestion id. A failure reads as none. */
async function loadAnswered(ids: string[]): Promise<Record<string, Answer>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('suggestion_verdicts').select('suggestion_id, verdict, round')
    .in('suggestion_id', ids).order('round', { ascending: true })
  if (error) { console.warn(`daily_answers_unavailable: ${describeDbError(error)}`); return {} }
  const out: Record<string, Answer> = {}
  for (const r of (data || []) as Array<{ suggestion_id: string; verdict: string }>) {
    if (ANSWERS.has(r.verdict)) out[r.suggestion_id] = r.verdict as Answer
  }
  return out
}

/** Who each move is about, from contacts, for the wire. */
async function loadPeople(ids: string[]): Promise<Record<string, AskPerson>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('contacts').select('id, full_name, title, company, email, linkedin_url').in('id', [...new Set(ids)])
  if (error) { console.warn(`daily_people_unavailable: ${describeDbError(error)}`); return {} }
  const out: Record<string, AskPerson> = {}
  for (const c of (data || []) as Array<Record<string, unknown>>) {
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    out[String(c.id)] = {
      contact_id: String(c.id), name: str(c.full_name) || 'Unnamed', title: str(c.title), company: str(c.company),
      best_channel: null, email: str(c.email), linkedin_url: str(c.linkedin_url),
    }
  }
  return out
}

/** The draft link for each drafted approach a move is about. Only an https
 *  link: it becomes an anchor on Home, and a stored value is not trusted to be
 *  one just because the system wrote it. */
async function loadDraftLinks(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('pilot_deals').select('id, draft_url').in('id', [...new Set(ids)])
  if (error) { console.warn(`daily_drafts_unavailable: ${describeDbError(error)}`); return {} }
  const out: Record<string, string> = {}
  for (const d of (data || []) as Array<{ id: string; draft_url: string | null }>) {
    if (d.draft_url && /^https:\/\//i.test(d.draft_url.trim())) out[d.id] = d.draft_url.trim()
  }
  return out
}

/** The deal states past the send wall: the approach left the machine. */
const DEAL_SENT_OR_BEYOND = new Set(['sent', 'replied', 'call_booked', 'call_taken', 'pilot_booked', 'pilot_paid'])

/** Each deal's state, by id. A failure reads as none. */
async function loadDealStates(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('pilot_deals').select('id, state').in('id', [...new Set(ids)])
  if (error) { console.warn(`daily_deal_states_unavailable: ${describeDbError(error)}`); return {} }
  const out: Record<string, string> = {}
  for (const d of (data || []) as Array<{ id: string; state: string }>) out[d.id] = d.state
  return out
}

// ── POST: one read, streamed ─────────────────────────────────────────────────

async function post(req: VercelRequest, res: VercelResponse) {
  const parsed = parseStrategistRequest(req.body)
  if (parsed.ok === false) return res.status(400).json({ ok: false, error: parsed.error, detail: parsed.detail })
  const request: StrategistRequest = parsed.request

  // The goal is read before anything else, so a goal that is not there is a
  // 404 with a status rather than an in-band error on an open stream.
  let goal: GoalSubject | null = null
  if (request.source === 'goal') {
    const g = await loadGoalSubject(request.goalId)
    if (g.ok === false) return res.status(g.status).json({ ok: false, error: g.error, detail: g.detail })
    goal = g.goal
  }

  const tz = await resolveTz(req)
  const now = new Date()
  const today = ymdIn(now, tz)
  // A Monday note written on a Sunday is for the week that starts tomorrow,
  // the same rule a weekly objective set at the weekend follows.
  const weekStart = request.source === 'note' && request.kind === 'week_open'
    ? targetWeekStartIn(now, tz)
    : weekOfIn(now, tz)

  const shape = readShapeFor({
    source: request.source,
    rung: goal ? goal.horizon : null,
    noteKind: request.source === 'note' ? request.kind : null,
  })
  const thinks = thinksFor(shape)
  const producer = {
    agent: STRATEGIST_AGENT,
    persona: STRATEGIST_PERSONA,
    model: SYNTHESIS_MODEL,
    prompt_rev: STRATEGIST_PROMPT_REV,
    think: thinks,
    shape,
  }

  // 1. What he said is kept before the model runs.
  let readId: string | null = null
  let persistError: string | undefined
  try {
    const { data, error } = await supabase.from('strategist_reads').insert({
      source: request.source,
      goal_id: goal ? goal.id : null,
      note_kind: request.source === 'note' ? request.kind : null,
      note_body: request.source === 'note' ? request.body : null,
      week_start: weekStart,
      status: 'pending',
      producer,
    }).select('id').single()
    if (error) persistError = describeDbError(error)
    else readId = String((data as { id: unknown }).id)
  } catch (e) {
    persistError = describeDbError({ message: (e as Error)?.message || String(e) })
  }
  if (persistError) console.warn(`strategist_pending_not_written: ${persistError}`)

  // 2. The stream. Nothing below answers with a status: headers are out.
  openStream(res)
  const live = () => !res.writableEnded && !res.destroyed
  const emit = (event: string, data: unknown) => { if (live()) send(res, event, data) }
  const stage = (s: StrategistStage) => emit('stage', { stage: s })
  const ping = setInterval(() => { if (live()) res.write(': ping\n\n') }, PING_MS)

  // Whether "what you said is kept" is true: only a note whose pending row was
  // written. Before the migration nothing is kept, and the sentence says so.
  const said = request.source === 'note' && readId ? 'note' : 'goal'

  let status: 'complete' | 'incomplete' = 'incomplete'
  try {
    stage('grounding')
    const input: GroundingInput = request.source === 'goal'
      ? { source: 'goal', goal: goal as GoalSubject }
      : { source: 'note', kind: request.kind, body: request.body }
    let loaded
    try {
      loaded = await loadStrategistGrounding(input, tz, { today, weekStart, excludeReadId: readId })
    } catch (e) {
      console.warn(`strategist_grounding_failed: ${(e as Error)?.message || String(e)}`)
      await markIncomplete(readId, producer, ['grounding_failed'])
      emit('error', {
        error: 'grounding_failed',
        detail: said === 'note'
          ? 'Your numbers and your network could not be read, so there is no read this time. What you said is kept, and you can run it again.'
          : 'Your numbers and your network could not be read, so there is no read this time. You can run it again.',
        read_id: readId,
      } satisfies StrategistErrorEvent)
      return
    }
    const { grounding, contacts, degraded } = loaded

    const system = buildStrategistSystem({
      source: request.source,
      rung: goal ? goal.horizon : null,
      noteKind: request.source === 'note' ? request.kind : null,
    })
    const user = buildStrategistUser(grounding)
    const ctx = buildValidationCtx({ shape, system, grounding })
    const acc = createReadAccumulator(ctx)

    // 3. The model, its lines checked one at a time as they arrive.
    let stopped = false
    let wrote = false
    const splitter = createLineSplitter(line => {
      if (stopped) return
      const r = acc.line(line)
      if (!r) return
      if ('dropped' in r) {
        console.warn(`strategist_line_dropped kind=${r.dropped.kind} reason=${r.dropped.reason}`)
        return
      }
      if ('section' in r) {
        if (!wrote) { wrote = true; stage('writing') }
        emit('section', { index: r.index, section: sectionWithContacts(r.section, contacts) } satisfies StrategistSectionEvent)
      }
    })

    stage('thinking')
    const ac = new AbortController()
    const onText = (chunk: string) => { if (!stopped) splitter.push(chunk) }
    const outcome = await raceDeadline(callModel(thinks, system, user, onText, ac.signal), DEADLINE_MS, () => {
      stopped = true
      ac.abort()
    })
    if (outcome.kind === 'failed') console.warn(`strategist_model_failed: ${outcome.message.slice(0, 300)}`)
    if (outcome.kind === 'timed_out') console.warn(`strategist_model_timed_out after ${DEADLINE_MS}ms`)
    // A last line that never got its newline is still a line, unless the
    // deadline cut it off mid-write.
    if (!stopped) splitter.flush()
    stopped = true

    // 4. Whole, or not. The end sentinel decides: a read that ended is a read
    //    even if the connection then failed, and one that did not is not.
    const verdict = acc.finish()
    if (verdict.complete === false) {
      const failure: ReadFailure = outcome.kind === 'timed_out' ? 'timed_out'
        : outcome.kind === 'failed' ? 'anthropic_failed'
        : 'incomplete'
      const reasons = failure === 'incomplete' ? verdict.reasons : [failure, ...verdict.reasons]
      console.warn(`strategist_read_incomplete reasons=${reasons.join(',')}`)
      await markIncomplete(readId, producer, reasons)
      const e = readFailureEvent(failure, reasons, said)
      emit('error', { ...e, read_id: readId } satisfies StrategistErrorEvent)
      return
    }

    // 5. Saved: the bank rows first (their subject is the pending row), then
    //    the read, stamped with their ids and stripped of contact details.
    stage('saving')
    const notes = [...verdict.notes, ...degraded.map(d => `grounding:${d}`)]
    let read: StrategistRead = verdict.read
    let suggestionIds: string[] = []
    let persisted = false
    if (readId) {
      const rows = suggestionRowsFor(read, readId, { model: SYNTHESIS_MODEL, think: thinks, shape })
      const bank = await recordSuggestions(rows)
      if (bank.ok === true) {
        suggestionIds = bank.ids
        read = stampSuggestionIds(read, bank.ids)
      } else {
        persistError = bank.reason
        console.warn(`strategist_suggestions_not_written: ${bank.reason}`)
      }
      const stored = withoutContacts(read)
      const { error } = await supabase.from('strategist_reads').update({
        status: 'complete',
        sections: stored,
        headline: stored.headline.text,
        handoff_reason: null,
        producer: { ...producer, notes },
      }).eq('id', readId)
      if (error) {
        persistError = describeDbError(error)
        console.warn(`strategist_read_not_saved: ${persistError}`)
      } else {
        persisted = true
      }
    }
    status = 'complete'

    const done: StrategistDoneEvent = {
      ok: true,
      read_id: readId,
      suggestion_ids: suggestionIds,
      persisted,
      ...(persistError ? { persist_error: persistError } : {}),
      read: withContacts(read, contacts),
      notes,
    }
    emit('done', done)

    // 6. A kept note read starts a walkthrough session on his subscription
    //    (api/_walkthrough.ts). After done, so the read never waits on it;
    //    awaited, so the function lives until the fire settles. It never
    //    throws, and a failure leaves a row the read's button can retry.
    if (persisted && readId && request.source === 'note') {
      const run = await startWalkthrough(readId, 'auto')
      emit('walkthrough', { read_id: readId, run })
    }
  } catch (e) {
    // Never a 500 once the stream is open: the failure is said in-band.
    console.warn(`strategist_unexpected: ${(e as Error)?.message || String(e)}`)
    await markIncomplete(readId, producer, ['unexpected'])
    emit('error', { ...readFailureEvent('unexpected', ['unexpected'], said), read_id: readId } satisfies StrategistErrorEvent)
  } finally {
    clearInterval(ping)
    await audit(readId, status)
    if (live()) res.end()
  }
}

// ── The model: two literal call sites ────────────────────────────────────────

function callModel(
  thinks: boolean,
  system: string,
  user: string,
  onText: (chunk: string) => void,
  signal: AbortSignal,
): Promise<string> {
  if (thinks) {
    return streamClaude({
      agent: 'goal-strategist',
      model: SYNTHESIS_MODEL,
      think: true,
      effort: 'medium',
      maxTokens: 20000,
      system,
      messages: [{ role: 'user', content: user }],
      onText,
      signal,
    })
  }
  return streamClaude({
    agent: 'goal-strategist',
    model: SYNTHESIS_MODEL,
    think: false,
    maxTokens: 4000,
    system,
    messages: [{ role: 'user', content: user }],
    onText,
    signal,
  })
}

type ModelOutcome = { kind: 'done' } | { kind: 'failed'; message: string } | { kind: 'timed_out' }

/** The call against a deadline. On timeout the caller stops listening and
 *  aborts; a rescue stream that ignores the signal is simply no longer read. */
async function raceDeadline(work: Promise<unknown>, ms: number, onTimeout: () => void): Promise<ModelOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<ModelOutcome>(resolve => {
    timer = setTimeout(() => { onTimeout(); resolve({ kind: 'timed_out' }) }, ms)
  })
  const settled = work.then(
    (): ModelOutcome => ({ kind: 'done' }),
    (e: unknown): ModelOutcome => ({ kind: 'failed', message: (e as Error)?.message || String(e) }),
  )
  try {
    return await Promise.race([settled, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ── Writes that must never fail the read ─────────────────────────────────────

async function markIncomplete(readId: string | null, producer: Record<string, unknown>, reasons: string[]): Promise<void> {
  if (!readId) return
  try {
    const { error } = await supabase.from('strategist_reads').update({
      status: 'incomplete',
      handoff_reason: 'strategist_read_incomplete',
      producer: { ...producer, reasons },
    }).eq('id', readId)
    if (error) console.warn(`strategist_incomplete_not_saved: ${describeDbError(error)}`)
  } catch (e) {
    console.warn(`strategist_incomplete_not_saved: ${(e as Error)?.message || String(e)}`)
  }
}

/** The event and the read id. Nothing he said, nothing the read says. */
async function audit(readId: string | null, status: 'complete' | 'incomplete'): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      id: `strategist-${readId ?? `unsaved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}-${status}`,
      event_type: `strategist_read_${status}`,
      actor: 'marcus',
      target: readId,
    })
  } catch {
    // An audit line never fails a read.
  }
}
