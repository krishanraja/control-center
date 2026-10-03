import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, PenLine } from '@/lib/icons'
import { SlideOver } from '../shared/SlideOver'
import { BottomSheet } from '../mobile/BottomSheet'
import { FocusedEditor } from '../shared/FocusedEditor'
import { Eyebrow } from '../shared/Eyebrow'
import { OptionChips } from '../goals/GoalPickers'
import { TalkBox, NOTE_MAX_CHARS, clearTalkDraft, readTalkDraft, writeTalkDraft } from './TalkBox'
import { ReadView, StrategistRead, type TakeResult } from './StrategistRead'
import { requestOk } from '../../lib/apiFetch'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import {
  useStrategist, autoRunAllowed, readNotKept,
  type StrategistRunState,
} from '../../hooks/useStrategist'
import {
  useStrategistOpen, closeStrategist, leaveObjectiveForRitual,
  NOTE_KIND_OPTIONS, inferNoteKind, noteKindLabel, type StrategistMode,
} from '../../lib/strategist'
import { openFocusRitual } from '../../lib/focusRitual'
import { relativeTime } from '../../lib/ageHelpers'
import type {
  NoteKind,
  ObjectiveSection,
  StrategistGetResponse,
  StrategistReadWire,
} from '../../types/strategist'

// The strategist's sheet (ADR-026): say how it is going, or read a goal, and
// get back what a strategy consultant who knows his record would say, ending in
// one move. Mounted once in App beside TabChatHost and the Focus Ritual, opened
// over the src/lib/strategist.ts bus from the ladder, the + sheet and the
// command palette.
//
// The host switch is TabChat's: a SlideOver on a desk, a full-height
// BottomSheet on a phone. On a phone the words go in through the house
// FocusedEditor first (voice beside the keyboard, one full-width button), and
// the sheet opens only after the editor has closed: one sheet at a time, never
// one inside another.
//
// Nothing here fetches until it is open. The canon, the latest read and the
// daily focus are all read from inside the open sheet, so Home pays for none
// of it (the no-scroll gates measure Home as it loads).

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/** How long the phone editor gets to leave before the sheet arrives. */
const HANDOVER_MS = 280

/** editor: the phone's FocusedEditor. handover: neither, for HANDOVER_MS. sheet: the read. */
type Phase = 'editor' | 'handover' | 'sheet'

export function StrategistSheet({ narrow, tab, onNavigate }: {
  narrow: boolean
  tab: string
  onNavigate?: NavigateFn
}) {
  const bus = useStrategistOpen()
  // On a phone a note starts in the editor; the sheet follows it. Both are
  // keyed to the open they belong to, so a reopen never flashes the last
  // open's sheet for a frame before the editor.
  const firstPhase: Phase = narrow && bus.mode === 'talk' ? 'editor' : 'sheet'
  const [phaseFor, setPhaseFor] = useState<{ nonce: number; phase: Phase }>({ nonce: -1, phase: 'sheet' })
  const [noteFor, setNoteFor] = useState<{ nonce: number; note: { kind: NoteKind; body: string } } | null>(null)
  const phase = phaseFor.nonce === bus.nonce ? phaseFor.phase : firstPhase
  const phoneNote = noteFor && noteFor.nonce === bus.nonce ? noteFor.note : null
  const submitted = useRef<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => { submitted.current = null }, [bus.nonce])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  // "Take it" from the sheet: only the ritual's weekly step creates an
  // objective (its own add(), the goal gate), so the wording goes there. The
  // sheet closes first; the ritual opens on Home once it has.
  const handOff = (o: ObjectiveSection): TakeResult => {
    leaveObjectiveForRitual({ text: o.text, serves: o.serves || null, job: o.job, suggestionId: o.suggestion_id ?? null })
    closeStrategist()
    if (tab !== 'home') onNavigate?.('home')
    timer.current = window.setTimeout(() => openFocusRitual('weekly'), HANDOVER_MS)
    return 'handed'
  }

  const sheetOpen = bus.open && phase === 'sheet'
  const label = bus.mode === 'goal' ? 'The read' : bus.mode === 'daily' ? 'Today\'s move' : 'Talk it through'

  const body = sheetOpen ? (
    <SheetBody
      mode={bus.mode}
      goalId={bus.goalId}
      fresh={bus.fresh}
      presetKind={bus.kind}
      phoneNote={phoneNote}
      narrow={narrow}
      nonce={bus.nonce}
      onTake={handOff}
    />
  ) : null

  return (
    <>
      {bus.open && narrow && bus.mode === 'talk' && phase === 'editor' && (
        <PhoneEntry
          presetKind={bus.kind}
          onSubmit={text => { submitted.current = text }}
          onClosed={kind => {
            const text = submitted.current
            submitted.current = null
            const nonce = bus.nonce
            if (!text) { closeStrategist(); return }
            setNoteFor({ nonce, note: { kind, body: text } })
            // Hold the editor's phase until the sheet takes over, so nothing
            // is open for the handover and nothing opens inside anything.
            setPhaseFor({ nonce, phase: 'handover' })
            timer.current = window.setTimeout(() => setPhaseFor({ nonce, phase: 'sheet' }), HANDOVER_MS)
          }}
        />
      )}

      {narrow ? (
        <BottomSheet open={sheetOpen} onClose={closeStrategist} fullHeight ariaLabel={label}>
          <div className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
            <div className="pb-3"><Eyebrow tone="accent">{label}</Eyebrow></div>
            {body}
          </div>
        </BottomSheet>
      ) : (
        <SlideOver open={sheetOpen} onClose={closeStrategist} ariaLabel={label} label={label}>
          {body}
        </SlideOver>
      )}
    </>
  )
}

// ── the phone's way in ───────────────────────────────────────────────────────

/**
 * The house editor, used for dictation the way TalkBox is on the desk: the
 * kind is his to pick before anything runs (chips above the field), every
 * change is kept on this device as he dictates, so a swipe, a tap on the scrim
 * or Escape never loses what he said, and the field grows with the words
 * instead of showing three rows of them.
 */
function PhoneEntry({ presetKind, onSubmit, onClosed }: {
  presetKind: NoteKind | null
  onSubmit: (text: string) => void
  onClosed: (kind: NoteKind) => void
}) {
  const { canon } = useGoalCanon()
  const [picked, setPicked] = useState<NoteKind | null>(presetKind)
  const kind = picked ?? inferNoteKind((canon?.weekly.length ?? 0) > 0)
  const [draft] = useState(readTalkDraft)
  return (
    <FocusedEditor
      open
      onClose={() => onClosed(kind)}
      label="Tell Marcus how it is going"
      header={
        <OptionChips
          label="What is this?"
          options={NOTE_KIND_OPTIONS}
          value={kind}
          onChange={v => setPicked(v as NoteKind)}
        />
      }
      value={draft}
      onChange={writeTalkDraft}
      grow
      placeholder="Say how it is going, in your own words."
      saveLabel="Send to Marcus"
      onSave={text => {
        // Too long is said in the sheet, where there is room to say it and
        // the words are kept (TalkFlow).
        writeTalkDraft(text)
        onSubmit(text)
        return true
      }}
    />
  )
}

// ── the sheet's body ─────────────────────────────────────────────────────────

function SheetBody({ mode, goalId, fresh, presetKind, phoneNote, narrow, nonce, onTake }: {
  mode: StrategistMode
  goalId: string | null
  fresh: boolean
  presetKind: NoteKind | null
  phoneNote: { kind: NoteKind; body: string } | null
  narrow: boolean
  nonce: number
  onTake: (o: ObjectiveSection) => TakeResult
}) {
  return (
    <div data-testid="strategist-sheet" data-mode={mode} className="flex flex-col gap-5 min-w-0">
      {mode === 'daily'
        ? <DailyRead key={nonce} narrow={narrow} onTake={onTake} />
        : mode === 'goal' && goalId
          ? <GoalRead key={`${goalId}:${nonce}`} goalId={goalId} fresh={fresh} freshKey={fresh ? nonce : undefined} narrow={narrow} onTake={onTake} />
          : <TalkFlow key={nonce} presetKind={presetKind} initialNote={phoneNote} narrow={narrow} onTake={onTake} autoFocus={!narrow} />}
    </div>
  )
}

/**
 * Today's move as a full read (ADR-028): the moves best first, the ask drafted
 * for any that is a request to a person, and what the first move survived. A
 * read only, never a model call: the cron wrote it this morning.
 */
function DailyRead({ narrow, onTake }: { narrow: boolean; onTake: (o: ObjectiveSection) => TakeResult }) {
  const [wire, setWire] = useState<StrategistReadWire | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    requestOk<Partial<StrategistGetResponse> & { ok?: boolean; error?: string }>('/api/strategist?daily=today', { timeoutMs: 12_000 })
      .then(j => { if (alive) setWire(j.read && typeof j.read === 'object' && j.read.read ? j.read : null) })
      .catch(() => { if (alive) setWire(null) })
    return () => { alive = false }
  }, [])
  if (wire === undefined) return null
  if (!wire?.read) {
    return (
      <p data-testid="strategist-daily-none" className="text-body leading-relaxed text-ink-muted">
        No move for today yet. One is written each morning from five, your time.
      </p>
    )
  }
  const c = wire.read.challenge
  return (
    <div data-testid="strategist-daily-read" className="flex flex-col gap-5 min-w-0">
      <StrategistRead read={wire.read} sections={[]} narrow={narrow} onTakeObjective={onTake} />
      {c && (
        <section data-testid="strategist-daily-survived" className="flex flex-col gap-1.5 min-w-0">
          <Eyebrow>What the first move survived</Eyebrow>
          {c.verdict === 'unchallenged' || !c.objection ? (
            <p className="text-body leading-relaxed text-ink-muted break-words">{c.why || 'No second opinion today.'}</p>
          ) : (
            <>
              <p className="text-body leading-relaxed text-ink break-words">{c.by || 'A second strategist'} argued against it: {c.objection}</p>
              {c.why && (
                <p className="text-label leading-relaxed text-ink-muted break-words">
                  {c.verdict === 'switched' ? 'Why it moved up: ' : 'Why it stayed first: '}{c.why}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * Say it, then read it. Used by the sheet and, inline, by the ritual's weekly
 * step. After a note is sent the box folds into what he said (kept whole, never
 * clipped), with the kind still his to change: picking another kind offers to
 * read it again that way.
 */
export function TalkFlow({
  presetKind = null,
  initialNote = null,
  narrow,
  onTake,
  autoFocus = false,
  inline = false,
}: {
  presetKind?: NoteKind | null
  initialNote?: { kind: NoteKind; body: string } | null
  narrow: boolean
  onTake: (o: ObjectiveSection) => Promise<TakeResult> | TakeResult
  autoFocus?: boolean
  /** Inside the ritual: a shorter box, a one-line wait, and only the drafted
   *  objectives of a read he made earlier. */
  inline?: boolean
}) {
  const { canon } = useGoalCanon()
  const hasObjectives = (canon?.weekly.length ?? 0) > 0
  const weekTitles = (canon?.weekly ?? []).map(g => g.title)
  const { state, run, latest } = useStrategist()
  const [note, setNote] = useState<{ kind: NoteKind; body: string } | null>(initialNote)
  const [rekind, setRekind] = useState<NoteKind | null>(null)
  const [stored, setStored] = useState<StrategistReadWire | null>(null)
  const [showStored, setShowStored] = useState(inline)
  const [tooLong, setTooLong] = useState(false)

  const send = (kind: NoteKind, body: string) => {
    setNote({ kind, body })
    setRekind(null)
    // The server's cap, said before a call is spent on it. The words stay.
    if (body.length > NOTE_MAX_CHARS) { setTooLong(true); return }
    setTooLong(false)
    // The draft on this device goes only once the server has kept the note:
    // a read that came back unkept (persisted:false, or no row) leaves what
    // he said nowhere else.
    void run({ source: 'note', kind, body }).then(s => {
      if (s.status === 'ready' && s.persisted === true && s.readId) clearTalkDraft()
    })
  }

  // The phone arrives with its note already said.
  useEffect(() => {
    if (initialNote) send(initialNote.kind, initialNote.body)
  }, [])

  // This week's latest read, so objectives drafted from an earlier note can
  // still be taken. A read only, never a model call.
  useEffect(() => {
    let alive = true
    latest('week').then(r => { if (alive) setStored(r.read) }).catch(() => { /* no read to show */ })
    return () => { alive = false }
  }, [latest])

  const storedWhen = relativeTime(stored?.created_at)

  return (
    <div className="flex flex-col gap-5 min-w-0" data-testid={inline ? 'strategist-talk-inline' : 'strategist-talk'}>
      {note ? (
        <section className="flex flex-col gap-2 min-w-0" data-testid="strategist-you-said">
          <div className="flex items-center gap-2">
            <Eyebrow>What you said</Eyebrow>
            <button
              type="button"
              data-testid="strategist-say-again"
              disabled={state.status === 'running'}
              onClick={() => { writeTalkDraft(note.body); setNote(null) }}
              className="tap-44 ml-auto inline-flex items-center gap-1 text-label text-ink-faint hover:text-ink-muted disabled:opacity-40"
            >
              <PenLine size={12} /> Change what you said
            </button>
          </div>
          <p className="text-body leading-relaxed text-ink-muted whitespace-pre-wrap break-words">{note.body}</p>
          <OptionChips
            options={NOTE_KIND_OPTIONS}
            value={rekind ?? note.kind}
            onChange={v => setRekind(v === note.kind ? null : v as NoteKind)}
            disabled={state.status === 'running'}
          />
          {rekind && (
            <div>
              <button
                type="button"
                data-testid="strategist-reread"
                onClick={() => send(rekind, note.body)}
                className="tap-44 inline-flex min-h-[36px] items-center rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 text-label text-violet-200 hover:bg-violet-500/30"
              >
                Read it as {noteKindLabel(rekind).toLowerCase()}
              </button>
            </div>
          )}
        </section>
      ) : (
        <TalkBox hasObjectives={hasObjectives} kind={presetKind} busy={state.status === 'running'} onSend={send} autoFocus={autoFocus} compact={inline} />
      )}

      {note && tooLong && (
        <p data-testid="strategist-too-long" role="alert" className="text-body leading-relaxed text-ink-muted">
          That is over 12,000 characters. Split it in two and send each half.
        </p>
      )}

      {note && !tooLong && (
        <ReadView
          state={state}
          workKey="strategist.read"
          narrow={narrow}
          inline={inline}
          onTakeObjective={onTake}
          onRetry={() => send(note.kind, note.body)}
          alreadyIn={weekTitles}
          testId="strategist-note-read"
        />
      )}

      {/* The last read from this week, when nothing new has been said here. */}
      {!note && stored?.read && (!inline || stored.read.objectives.length > 0) && (
        <section className="flex flex-col gap-3 min-w-0" data-testid="strategist-stored">
          {inline ? (
            <Eyebrow>{storedWhen ? `From what you said ${storedWhen}` : 'From what you said this week'}</Eyebrow>
          ) : (
            <button
              type="button"
              aria-expanded={showStored}
              onClick={() => setShowStored(v => !v)}
              className="tap-44 inline-flex min-h-[36px] items-center gap-1.5 self-start text-label text-ink-muted hover:text-ink"
            >
              {showStored ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {storedWhen ? `Your last read, ${storedWhen}` : 'Your last read'}
            </button>
          )}
          {showStored && (
            <ReadView
              state={IDLE_STATE}
              stored={stored}
              workKey="strategist.read"
              narrow={narrow}
              inline={inline}
              onTakeObjective={onTake}
              objectivesOnly={inline}
              alreadyIn={weekTitles}
            />
          )}
        </section>
      )}
    </div>
  )
}

const IDLE_STATE: StrategistRunState = {
  status: 'idle', stage: null, sections: [], read: null, readId: null,
  persisted: null, error: null, errorCode: null, startedAt: null,
}

/**
 * Read one goal. Opened fresh (the ladder just saved or retitled it) it reads
 * now. Otherwise it shows the latest read, and reads only when there is none,
 * the last attempt is not a failure under a day old, and nothing this session
 * came back unkept.
 */
export function GoalRead({ goalId, fresh, freshKey, narrow, onTake, inline = false }: {
  goalId: string
  fresh: boolean
  /** The open a fresh read belongs to (the bus nonce). A fresh read never
   *  joins a read of the old wording still streaming for the same goal. */
  freshKey?: string | number
  narrow: boolean
  onTake: (o: ObjectiveSection) => Promise<TakeResult> | TakeResult
  inline?: boolean
}) {
  const { canon } = useGoalCanon()
  const goal = canon ? [...canon.os, ...canon.weekly].find(g => g.id === goalId) ?? null : null
  const { state, run, latest } = useStrategist()
  const [got, setGot] = useState<StrategistGetResponse | null>(null)
  const [looked, setLooked] = useState(false)

  const read = () => { void run({ source: 'goal', goalId }, { fresh: fresh ? freshKey : undefined }) }

  useEffect(() => {
    let alive = true
    if (fresh) { read(); return }
    latest(goalId)
      .then(r => {
        if (!alive) return
        setGot(r)
        setLooked(true)
        if (autoRunAllowed(goalId, r)) read()
      })
      .catch(() => { if (alive) setLooked(true) })
    return () => { alive = false }
  }, [goalId, fresh])

  const idle = state.status === 'idle'
  const held = idle && looked && !got?.read
  const lastTried = relativeTime(got?.last_attempt_at)

  return (
    <div className="flex flex-col gap-4 min-w-0" data-testid={inline ? 'strategist-goal-inline' : 'strategist-goal'}>
      {goal && !inline && (
        <p className="text-label text-ink-muted break-words">
          <span className="text-ink-faint">{goal.horizon === 'os' ? 'OS goal: ' : 'This week: '}</span>{goal.title}
        </p>
      )}
      {idle && got?.read && (
        <div>
          <button type="button" data-testid="strategist-read-again" onClick={read} className="tap-44 text-label text-ink-faint hover:text-ink-muted underline underline-offset-2">
            Read it again
          </button>
        </div>
      )}
      {held && (
        <div className="flex flex-col gap-2" data-testid="strategist-held">
          <p className="text-body leading-relaxed text-ink-muted">
            {readNotKept(goalId)
              ? 'The last read could not be kept, so it will not run again by itself.'
              : lastTried
                ? `The last read did not finish (${lastTried}), so it will not run again by itself today.`
                : 'There is no read of this goal yet.'}
          </p>
          <div>
            <button type="button" data-testid="strategist-run" onClick={read} className="tap-44 inline-flex min-h-[36px] items-center rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 text-label text-violet-200 hover:bg-violet-500/30">
              Read it now
            </button>
          </div>
        </div>
      )}
      <ReadView
        state={state}
        stored={got?.read ?? null}
        workKey="strategist.goal"
        narrow={narrow}
        inline={inline}
        onTakeObjective={onTake}
        onRetry={read}
        testId="strategist-goal-read"
      />
    </div>
  )
}

/**
 * The Focus Ritual's view of the OS goal's read: behind a disclosure, and
 * nothing is fetched or run until he opens it (ADR-018: his writing first, the
 * machine's suggestions only when asked for).
 */
export function OsReadDisclosure({ goalId, narrow, onTake }: {
  goalId: string
  narrow: boolean
  onTake: (o: ObjectiveSection) => Promise<TakeResult> | TakeResult
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 flex flex-col gap-3" data-testid="strategist-os-disclosure">
      <button
        type="button"
        aria-expanded={open}
        data-testid="strategist-os-toggle"
        onClick={() => setOpen(o => !o)}
        className="tap-44 inline-flex min-h-[36px] items-center gap-1.5 self-start text-label text-ink-muted hover:text-ink"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        What Marcus reads in the OS goal
      </button>
      {open && <GoalRead goalId={goalId} fresh={false} narrow={narrow} onTake={onTake} inline />}
    </div>
  )
}

/** The short read of an objective he just added in the ritual. */
export function AddedObjectiveRead({ goalId, title, narrow, onTake }: {
  goalId: string
  title: string
  narrow: boolean
  onTake: (o: ObjectiveSection) => Promise<TakeResult> | TakeResult
}) {
  return (
    <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3 flex flex-col gap-3" data-testid="strategist-added-read">
      <p className="text-label text-ink-muted break-words"><span className="text-ink-faint">You just added: </span>{title}</p>
      <GoalRead goalId={goalId} fresh narrow={narrow} onTake={onTake} inline />
    </div>
  )
}
