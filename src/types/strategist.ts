// The strategist's wire types: what api/strategist.ts streams and returns, and
// what the sheet renders. Types only and import-free on purpose, because the
// serverless tree (NodeNext) imports this file too, and a relative import in
// here would have to carry a `.js` specifier the app's bundler does not want.
//
// The unions below repeat literals owned elsewhere (focusTheory.ts for lenses,
// rules and traps; api/_mission.ts for jobs). api/_strategist.ts asserts at
// compile time that each one still matches its source, so `npm run
// typecheck:api` fails on drift rather than a read quietly carrying a lens the
// sheet cannot draw.
//
// Two ways in (Krish, 2026-09-27):
//   { source: 'goal', goalId }            read a goal: the OS goal gets the
//                                         full read, a weekly objective a
//                                         short one
//   { source: 'note', kind, body }        what he said, dictated or typed, on
//                                         a Monday, during the week, or at
//                                         the end of it

// ── Vocabularies ─────────────────────────────────────────────────────────────

/** 'daily' is the read nobody asked for: the morning's one move, written by
 *  the cron from the whole state of his work (ADR-028). */
export type StrategistSource = 'goal' | 'note' | 'daily'

/** Starting the week, progress during it, how it went. */
export type NoteKind = 'week_open' | 'update' | 'week_close'

/** Which rung a goal read is on. The OS goal gets the full read. */
export type GoalRung = 'os' | 'weekly'

/** The shape a read takes: one per goal rung, one per note kind. */
export type ReadShape = GoalRung | NoteKind | 'daily'

export type ReadStatus = 'pending' | 'complete' | 'incomplete'

/** Mirrors LensId in src/content/focusTheory.ts. */
export type StrategistLensId = 'sell_first' | 'partner' | 'capital_cofounder' | 'distribution' | 'help' | 'isolation'

/** Mirrors RuleId in src/content/focusTheory.ts. */
export type StrategistRuleId = 'pushed' | 'cold' | 'slow_pay' | 'alone' | 'no_ownership' | 'private' | 'no_edge' | 'protected'

/** Mirrors TrapId in src/content/focusTheory.ts. */
export type StrategistTrapId = 'correcting' | 'overexplaining' | 'avoiding_ask' | 'polishing' | 'relitigating' | 'spiralling'

/** The jobs a strategist item may serve. The three open jobs of api/_mission.ts;
 *  run_pilots and keep_edge sit behind closed gates and a read never offers them. */
export type StrategistJob = 'fill_pilots' | 'keep_honest' | 'feed_demand'

/** A lens is either a move now, one for later, or already covered. */
export type LensStatus = 'move' | 'later' | 'covered'

/** Mark done, carry into next week, or drop. Applied through patchGoal. */
export type ProgressVerdict = 'done' | 'carry' | 'drop'

// ── Sections: one validated NDJSON line each ─────────────────────────────────
// Every section below is what the server emits AFTER validation and
// enrichment: labels, sources, names and ladder words are attached by the
// server from the corpus and the candidate list, never taken from the model.

/** What he is missing, rendered through shared/Claim with the rule as its source. */
export interface HeadlineSection {
  kind: 'headline'
  text: string
  rule: StrategistRuleId
  /** 1 to 8, the rule's number in the workbook. Server-filled. */
  rule_n: number
  /** The rule's chip, e.g. "I would be alone in it". Server-filled. */
  rule_chip: string
}

/** One line in his own words. Names a trap only when the note shows one. */
export interface HeardSection {
  kind: 'heard'
  text: string
  trap: StrategistTrapId | null
  /** The trap's chip and counter-move, from TRAPS. Server-filled, null with no trap. */
  trap_chip: string | null
  counter_move: string | null
}

export interface LensMove {
  text: string
  /** Null only for an investor move: no job of the five covers raising money. */
  job: StrategistJob | null
  /** An ISO date inside the next ninety days, or null. */
  by: string | null
  /** Only on the capital lens: which of the two the move is for. */
  target: 'cofounder' | 'investor' | null
  /** The plain sentence saying no job covers raising money. Set on investor
   *  moves only, by the server, so the read always says it. */
  job_note: string | null
}

export interface LensSection {
  kind: 'lens'
  lens: StrategistLensId
  /** From LENSES. Server-filled. */
  label: string
  rule: StrategistRuleId | null
  source: string
  status: LensStatus
  read: string
  /** What he could be missing. Null when the lens is covered. */
  missing: string | null
  /** Present exactly when status is 'move'. */
  move: LensMove | null
}

/** A weekly objective only: is it written outward or inward, and the outward wording. */
export interface ReframeSection {
  kind: 'reframe'
  direction: 'outward' | 'inward'
  why: string
  /** The outward wording, required when the objective is inward. Offered with Copy. */
  wording: string | null
}

/** A weekly objective drafted from what he said. Saved only through "Take it". */
export interface ObjectiveSection {
  kind: 'objective'
  /** At most 200 characters, the goal gate's own limit. */
  text: string
  job: StrategistJob
  /** The OS goal it serves (a canon goal id), and its title. Server-filled title. */
  serves: string
  serves_title: string
  lens: StrategistLensId | null
  why: string
  /** At most one objective in a read carries true: the swing. */
  play: boolean
  /** The suggestion row this item was written to, once persisted. */
  suggestion_id?: string | null
}

/** Mark a weekly objective done, carry it, or drop it. Canon ids only. */
export interface ProgressSection {
  kind: 'progress'
  goal_id: string
  /** Server-filled from the canon. */
  goal_title: string
  verdict: ProgressVerdict
  why: string
}

/** One concrete step for today, for "Put on today" (POST /api/daily-focus/slot). */
export type StepWhen = 'now' | 'today' | 'week'

export interface NextStepSection {
  kind: 'next_step'
  /** At most 240 characters, the slot's own limit. */
  text: string
  goal_id: string | null
  job: StrategistJob | null
  suggestion_id?: string | null
  /** Why this, today: one sentence tied to a goal, a date or a number. Daily
   *  reads only; the other shapes leave it out. */
  why?: string | null
  /** The warm contact the move is about, by id. The text never names them:
   *  a step he takes lands in daily_focus, which the browser key can read. */
  contact_id?: string | null
  /** The drafted approach the move is about, from OPEN DRAFTS. */
  pilot_deal_id?: string | null
  /** The battle plan (week_open and update reads, 2026-10-07): when the step
   *  belongs, how long it takes, and which of his threads it moves. A note
   *  that carries five threads comes back as small timed steps, each under
   *  its thread, sorted now, today, this week. Older reads leave them out. */
  when?: StepWhen | null
  minutes?: number | null
  thread?: string | null
  /** For the wire only, attached when the read is shown and never stored: the
   *  person the move is about, and the draft link when there is one. */
  person?: AskPerson | null
  draft_url?: string | null
}

/**
 * What the daily move survived, assembled by the server, never written by the
 * decider as a line: a model from another lab argued the strongest case
 * against the first move, and the decider kept it or switched to a runner-up.
 * 'unchallenged' says the second opinion did not arrive, rather than leaving
 * it to be assumed.
 */
export interface DailyChallenge {
  verdict: 'kept' | 'switched' | 'unchallenged'
  /** The objection, in the challenger's words, cleaned. Null when unchallenged. */
  objection: string | null
  /** Who objected, in plain words. */
  by: string | null
  /** Why the decider kept or switched, one sentence. */
  why: string | null
}

/** A named warm contact from the grounding's candidate list. Contact details
 *  are attached at read time by the guarded route and never stored. */
export interface AskPerson {
  contact_id: string
  name: string
  title: string | null
  company: string | null
  best_channel: string | null
  email?: string | null
  linkedin_url?: string | null
}

/** Who carries a role-described ask. Rule 2: never cold, so there is always a way in. */
export type AskVia =
  | { kind: 'contact'; person: AskPerson }
  | { kind: 'existing_client' }
  | { kind: 'published_piece' }

export type AskRecipient =
  | { kind: 'named'; person: AskPerson }
  | { kind: 'role'; role: string; via: AskVia }

/** The exposure ladder level in words. Never a percentage: his prediction is his own. */
export interface AskLadder {
  level: number
  request: string
  feared: string
  learning: string
}

export interface AskSection {
  kind: 'ask'
  to: AskRecipient
  /** At most twelve words. */
  line: string
  /** The full message, in the request formula. Shown in full, never clamped. */
  message: string
  why: string
  ladder: AskLadder
  lens: StrategistLensId | null
  job: StrategistJob | null
  /** Only on the capital lens, as on its move: an investor ask (job null) or
   *  a co-founder ask. Optional on the wire, so a read stored before it
   *  existed still reads. */
  target?: 'cofounder' | 'investor' | null
  /** Set on an investor ask only: no job covers raising money. */
  job_note: string | null
  suggestion_id?: string | null
  /** At assist (ADR-030, phase 5): the Gmail draft the read made, addressed
   *  to the person, in his own drafts folder. His press in Gmail is the only
   *  thing that sends. Absent at propose. */
  draft_url?: string | null
}

/** A worry he named, for "Compile this worry" (POST /api/pilot/worries {action:'compile'}). */
export interface WorrySection {
  kind: 'worry'
  /** His worry in his words, at most 4000 characters. */
  text: string
}

/** OS read only: the dated signal that would kill the goal. */
export interface KillSection {
  kind: 'kill'
  text: string
  by: string
}

/** How the week went: one learning line. */
export interface LearningSection {
  kind: 'learning'
  text: string
}

/** The stop-talking point for the one move. The one move is asks[0]. */
export interface CloseSection {
  kind: 'close'
  stop: string
}

export type StrategistSection =
  | HeadlineSection
  | HeardSection
  | LensSection
  | ReframeSection
  | ObjectiveSection
  | ProgressSection
  | NextStepSection
  | AskSection
  | WorrySection
  | KillSection
  | LearningSection
  | CloseSection

export type StrategistSectionKind = StrategistSection['kind']

// ── The read ─────────────────────────────────────────────────────────────────

/** A complete, validated read, as stored in strategist_reads.sections. */
export interface StrategistRead {
  v: 1
  shape: ReadShape
  headline: HeadlineSection
  heard: HeardSection | null
  /** In LENS_ORDER. All six on an OS read. */
  lenses: LensSection[]
  reframe: ReframeSection | null
  objectives: ObjectiveSection[]
  progress: ProgressSection[]
  next_steps: NextStepSection[]
  /** At least one. asks[0] is the one move, rendered through AskCard. */
  asks: AskSection[]
  worry: WorrySection | null
  kill: KillSection | null
  learning: LearningSection | null
  close: CloseSection
  /** Daily reads only. */
  challenge?: DailyChallenge | null
}

// ── The route ────────────────────────────────────────────────────────────────

/** POST /api/strategist. A note is at most 12,000 characters. */
export type StrategistRequest =
  | { source: 'goal'; goalId: string; tz?: string }
  | { source: 'note'; kind: NoteKind; body: string; tz?: string }

export type StrategistStage = 'grounding' | 'thinking' | 'writing' | 'saving'

/** SSE `stage`. Sent before the first section, so the wait says what it is doing. */
export interface StrategistStageEvent {
  stage: StrategistStage
}

/** SSE `section`. One validated line, in the order the model wrote it. */
export interface StrategistSectionEvent {
  index: number
  section: StrategistSection
}

/** SSE `done`. persisted is false when the read could not be saved (for example
 *  before the migration is applied); the read still shows and nothing reruns. */
export interface StrategistDoneEvent {
  ok: true
  read_id: string | null
  /** One per actionable item (objectives, asks, next steps), in that order. */
  suggestion_ids: string[]
  persisted: boolean
  persist_error?: string
  read: StrategistRead
  /** Repairs made on the way (a second play flag cleared, a date dropped). */
  notes: string[]
}

export type StrategistErrorCode =
  | 'strategist_read_incomplete'
  | 'anthropic_failed'
  | 'grounding_failed'
  | 'timed_out'

/** SSE `error`. detail is a plain sentence written for Krish, never provider text. */
export interface StrategistErrorEvent {
  error: StrategistErrorCode
  detail: string
  read_id?: string | null
}

/** One stored read as GET returns it. Only ever the latest: there is no archive. */
export interface StrategistReadWire {
  id: string
  created_at: string
  source: StrategistSource
  goal_id: string | null
  note_kind: NoteKind | null
  week_start: string
  status: ReadStatus
  headline: string | null
  /** Null unless status is 'complete'. Actionable items carry suggestion_id. */
  read: StrategistRead | null
  last_attempt_at: string
  /** The civil date a daily read is for. Null on goal and note reads. */
  read_date?: string | null
  /** Daily reads only: what he already did with each item, by suggestion id,
   *  so Home shows the next move rather than the one he set aside. */
  answered?: Record<string, 'accepted' | 'rejected' | 'deferred' | 'replaced' | 'tweaked'>
}

/** GET /api/strategist?goalId= or ?week=current. */
export interface StrategistGetResponse {
  ok: true
  /** The latest complete read, or null. */
  read: StrategistReadWire | null
  /** The latest attempt of any status, for the 24 hour backoff after a failure. */
  last_attempt_at: string | null
  last_status: ReadStatus | null
}

/** POST /api/suggestions/verdict. Taken unchanged is accepted, taken after an
 *  edit is tweaked, "Not this" is rejected with a reason. */
export type StrategistVerdictKind = 'accepted' | 'tweaked' | 'replaced' | 'rejected' | 'deferred'

export interface StrategistVerdictRequest {
  suggestion_id: string
  verdict: StrategistVerdictKind
  final?: unknown
  /** Form-only keys (delta_keys_are_form_only), e.g. chars_before, chars_after, pct_shorter. */
  delta?: Record<string, number | string | boolean> | null
  reason_code?: string | null
  note?: string | null
}
