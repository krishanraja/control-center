import React, { useMemo, useState } from 'react'
import { ArrowUpRight, Check, Copy, ListChecks, Mail, Linkedin, Target } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Claim } from '../shared/Claim'
import { WhyBadge } from '../shared/WhyBadge'
import { RejectReasonBar } from '../shared/RejectReasonBar'
import { Working } from '../shared/Working'
import { Pending } from '../shared/Pending'
import { AskCard } from '../focusPurpose/AskCard'
import { useHaptics } from '../../hooks/useHaptics'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useElapsed } from '../../hooks/useAsyncAction'
import type { StrategistRunState } from '../../hooks/useStrategist'
import { useWork } from '../../lib/loadingVoice'
import { relativeTime } from '../../lib/ageHelpers'
import { STRATEGIST_SURFACE } from '../../lib/servedSurfaces'
import { contactAction, copyText } from '../../lib/contactAction'
import { postVerdict, editDelta, verdictForTaken } from '../../lib/suggestionsApi'
import { patchGoal } from '../../lib/goalsApi'
import { requestOk, failureMessage } from '../../lib/apiFetch'
import { civilYmd, getZone } from '../../lib/civilDate'
import { DECISION_RULES, LENSES } from '../../content/focusTheory'
import { jobLabel } from '../../content/jobs'
import { PLAN_LABEL, minutesLabel, planGroups } from '../../lib/battlePlan'
import type { Compilation } from '../../lib/worryStates'
import type {
  AskPerson,
  AskRecipient,
  AskSection,
  CloseSection,
  HeadlineSection,
  HeardSection,
  KillSection,
  LearningSection,
  LensSection,
  NextStepSection,
  StepOutcome,
  ObjectiveSection,
  ProgressSection,
  ReframeSection,
  StrategistRead as ReadBody,
  StrategistReadWire,
  StrategistSection,
  StrategistStage,
  WorrySection,
} from '../../types/strategist'

// The strategist's read, rendered (ADR-026). One component for the sheet and
// for the Focus Ritual's weekly step, streaming or complete.
//
// What it will and will not do:
//   - Every action goes through a wire path that already exists: "Take it"
//     through the ritual's own add() (createGoal and the goal gate, never a
//     write from here), Mark done through patchGoal, Put on today through
//     POST /api/daily-focus/slot, the worry through the worry compiler's
//     compile step, a named person through contactAction (never sends), and
//     the one move through AskCard with HIS prediction. Each is followed by
//     one best-effort verdict for the learning bank.
//   - The one move runs in the manual's order: the words, then his guess,
//     then contact, then "I sent it". The contact buttons for it appear only
//     once he has made it today's ask with his own prediction, so nothing
//     goes out that the ask log and the calibration never saw.
//   - Inside the Focus Ritual there is no AskCard at all: the ritual can hold
//     three reads, and three competing "today's ask" buttons is three moves.
//     The move there is its words and Copy; today's ask is made on Home.
//   - Nothing is ellipsised or clamped. A message is the message, whole.
//   - No percentages. The ladder is named in words: what the ask is, what it
//     can feel like, and what is true whatever the answer.
//   - Streamed sections are placed where the finished read puts them, grouped
//     by kind, so the page does not reshuffle when the read completes.

export type TakeResult = 'saved' | 'handed' | false

interface Props {
  /** The complete read, once `done` arrives. */
  read: ReadBody | null
  /** What has streamed so far, used until the read is complete. */
  sections: StrategistSection[]
  narrow: boolean
  /** What already happened to each step, by suggestion id (ADR-030). A daily
   *  read carries it on the wire; a streaming read has none yet. */
  outcomes?: Record<string, { outcome: StepOutcome; artifact: string | null }> | null
  /**
   * "Take it" on a drafted objective. In the ritual this is the weekly step's
   * own add() and resolves 'saved'; in the sheet it hands the wording to the
   * ritual and resolves 'handed' (the ritual records the verdict when he adds
   * it). False: nothing happened.
   */
  onTakeObjective: (o: ObjectiveSection) => Promise<TakeResult> | TakeResult
  /** Only the drafted objectives: the ritual's view of a note read he made earlier. */
  objectivesOnly?: boolean
  /** Inside the ritual, which may hold more than one read: the headline is a
   *  plain strong line, because a surface gets one serif claim, not several. */
  inline?: boolean
  /** This week's objective titles. A drafted objective already among them
   *  says so instead of offering "Take it" a second time. */
  alreadyIn?: string[]
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

interface Parts {
  headline: HeadlineSection | null
  heard: HeardSection | null
  lenses: LensSection[]
  reframe: ReframeSection | null
  objectives: ObjectiveSection[]
  progress: ProgressSection[]
  next_steps: NextStepSection[]
  asks: AskSection[]
  worry: WorrySection | null
  kill: KillSection | null
  learning: LearningSection | null
  close: CloseSection | null
}

export function partsOf(read: ReadBody | null, sections: StrategistSection[]): Parts {
  if (read) {
    return {
      headline: read.headline, heard: read.heard, lenses: read.lenses, reframe: read.reframe,
      objectives: read.objectives, progress: read.progress, next_steps: read.next_steps,
      asks: read.asks, worry: read.worry, kill: read.kill, learning: read.learning, close: read.close,
    }
  }
  const p: Parts = {
    headline: null, heard: null, lenses: [], reframe: null, objectives: [], progress: [],
    next_steps: [], asks: [], worry: null, kill: null, learning: null, close: null,
  }
  for (const s of sections) {
    switch (s.kind) {
      case 'headline': p.headline = s; break
      case 'heard': p.heard = s; break
      case 'lens': p.lenses.push(s); break
      case 'reframe': p.reframe = s; break
      case 'objective': p.objectives.push(s); break
      case 'progress': p.progress.push(s); break
      case 'next_step': p.next_steps.push(s); break
      case 'ask': p.asks.push(s); break
      case 'worry': p.worry = s; break
      case 'kill': p.kill = s; break
      case 'learning': p.learning = s; break
      case 'close': p.close = s; break
    }
  }
  return p
}

// ── small helpers ────────────────────────────────────────────────────────────

/** 2026-10-03 → "3 Oct". A bad date renders as itself rather than throwing. */
export function shortDay(ymd: string | null | undefined): string | null {
  if (!ymd) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  if (Number.isNaN(d.getTime())) return ymd
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

function firstName(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || ''
}

function personLine(p: AskPerson): string {
  const role = [p.title, p.company].filter(Boolean).join(' at ')
  return role ? `${p.name}, ${role}` : p.name
}

export function recipientLine(to: AskRecipient): string {
  if (to.kind === 'named') return personLine(to.person)
  const via = to.via.kind === 'contact'
    ? `through ${to.via.person.name}`
    : to.via.kind === 'existing_client'
      ? 'through a client you already work with'
      : 'through a piece you have published'
  // "To a chief executive", not "To A chief executive": the role is written
  // as a sentence start, and here it sits mid-sentence.
  const role = /^(A|An|The)\b/.test(to.role) ? to.role.charAt(0).toLowerCase() + to.role.slice(1) : to.role
  return `${role}, ${via}`
}

/** The person a click would reach: the named one, or the one who makes the intro. */
export function reachablePerson(to: AskRecipient): AskPerson | null {
  if (to.kind === 'named') return to.person
  return to.via.kind === 'contact' ? to.via.person : null
}

/**
 * The words that become today's ask (pilot_asks.ask_text). The short line, led
 * by a first name or a plain label so the log says who it was to. Never a full
 * name, a company or the model's own description of a role: that table is
 * readable with the browser key. The server refuses a line that carries a
 * candidate's full name, surname or company (name_in_line), and the role's
 * free text never reaches the log.
 */
export function askSeedText(a: AskSection): string {
  const p = reachablePerson(a.to)
  const who = p
    ? firstName(p.name)
    : a.to.kind === 'role'
      ? a.to.via.kind === 'existing_client' ? 'A client' : 'A reader'
      : ''
  return who ? `${who}: ${a.line}` : a.line
}

/**
 * The headline's source line: his rule, in the words of its own verdict. The
 * rule's chip is the FAILURE condition ("Needs cold outbound"), which under a
 * recommendation reads as the advice, so it is not used here.
 */
export function ruleSource(ruleId: string, ruleN: number): string {
  const rule = DECISION_RULES.find(r => r.id === ruleId)
  const first = rule ? (rule.verdict.match(/^[^.]+\./)?.[0] ?? rule.verdict) : ''
  return first ? `Your rule ${ruleN}: ${first}` : `Your rule ${ruleN}`
}

function lensLabel(id: string | null | undefined): string | null {
  if (!id) return null
  return (LENSES as Record<string, { label: string }>)[id]?.label ?? null
}

function lensSource(id: string | null | undefined): string | null {
  if (!id) return null
  return (LENSES as Record<string, { source: string }>)[id]?.source ?? null
}

/** The row the why badge reads (STRATEGIST_SURFACE.why). */
function whyRow(s: ObjectiveSection | NextStepSection | AskSection): Record<string, unknown> {
  const lens = 'lens' in s ? s.lens : null
  return {
    why: 'why' in s ? s.why : null,
    lens_label: lensLabel(lens),
    source: lensSource(lens),
    job_label: s.job ? jobLabel(s.job) : null,
    ladder: s.kind === 'ask' ? s.ladder : null,
  }
}

const STATUS_WORD: Record<LensSection['status'], string> = {
  move: 'A move now',
  later: 'Later',
  covered: 'Covered',
}

/**
 * What each progress verdict offers. Done and drop are real status changes,
 * through patchGoal; drop asks twice, as the ladder's own drop does. Carry is
 * information, not a button: the objective is already active, and the house
 * Carry (ADR-018) is the ritual cloning a missed row into a new week, which
 * it offers by itself.
 */
const PROGRESS_WORD: Record<ProgressSection['verdict'], {
  label: string
  action: { label: string; confirm: string | null; status: 'done' | 'dropped'; done: string } | null
  note: string | null
}> = {
  done: { label: 'Done', action: { label: 'Mark done', confirm: null, status: 'done', done: 'Marked done.' }, note: null },
  carry: { label: 'Keep going', action: null, note: 'Nothing to change. If it is still open when the week closes, the ritual offers to carry it.' },
  drop: { label: 'Drop it', action: { label: 'Drop it', confirm: 'Tap again to drop it', status: 'dropped', done: 'Dropped.' }, note: null },
}

/** The ledger's outcomes, in plain words. Only the first two mean done. */
const OUTCOME_WORDS: Record<StepOutcome, string> = {
  done_together: 'Done, with you, in a walkthrough.',
  did_it: 'Done. You did it.',
  drafted: 'Drafted with you. The press is yours.',
  later: 'You said later.',
  dropped: 'Dropped.',
}

// ── The battle plan ────────────────────────────────────────────────────────

const BTN = 'tap-44 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-label transition-colors disabled:opacity-40'
const BTN_PRIMARY = `${BTN} border-violet-400/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30`
const BTN_QUIET = `${BTN} border-white/10 text-ink-muted hover:bg-white/[0.05] hover:text-ink`
const NOT_THIS = 'tap-44 inline-flex min-h-[36px] items-center px-2 text-label text-ink-faint hover:text-ink-muted'

// ── the component ────────────────────────────────────────────────────────────

export function StrategistRead({ read, sections, narrow, outcomes = null, onTakeObjective, objectivesOnly = false, inline = false, alreadyIn = [] }: Props) {
  const h = useHaptics()
  const parts = useMemo(() => {
    const all = partsOf(read, sections)
    if (!objectivesOnly) return all
    return { ...partsOf(null, []), objectives: all.objectives }
  }, [read, sections, objectivesOnly])
  const complete = read !== null
  const inWeek = useMemo(() => new Set(alreadyIn.map(norm)), [alreadyIn])

  // One answer per item per read: a second tap does not write a second verdict.
  const [answered, setAnswered] = useState<Record<string, 'taken' | 'set_aside'>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // What an action said, shown under the item that did it. Inline, not a
  // toast: this renders inside the sheet and the ritual, and both sit above
  // the toast layer, so a toast from here would land behind them unseen.
  const [said, setSaid] = useState<Record<string, string>>({})
  // A drop asks twice: the key of the progress row whose drop is armed.
  const [armed, setArmed] = useState<string | null>(null)
  // A progress verdict is only offered on an objective that is still active
  // NOW: a stored read can be days old, and a row he has since marked done or
  // dropped must not be changed back from here.
  const { canon } = useGoalCanon()
  const liveStatus = (goalId: string): string | null => {
    const g = canon ? [...canon.os, ...canon.weekly].find(x => x.id === goalId) : null
    return g ? g.status : null
  }

  const mark = (key: string, v: 'taken' | 'set_aside') => setAnswered(a => ({ ...a, [key]: v }))
  const say = (key: string, line: string) => setSaid(m => ({ ...m, [key]: line }))
  const saidLine = (key: string) => said[key] ? (
    <p className="text-label leading-relaxed text-ink-muted break-words" role="status">{said[key]}</p>
  ) : null

  const notThis = (key: string, suggestionId: string | null | undefined) => (code?: string, note?: string) => {
    h.select()
    setRejecting(null)
    mark(key, 'set_aside')
    void postVerdict({
      suggestion_id: suggestionId ?? null,
      verdict: 'rejected',
      reason_code: code ?? STRATEGIST_SURFACE.defaultReason,
      note: note ?? null,
    })
  }

  const rejectBar = (key: string, suggestionId: string | null | undefined) => rejecting === key && (
    <RejectReasonBar
      title="Why not this one?"
      reasons={STRATEGIST_SURFACE.reasons}
      onChoose={notThis(key, suggestionId)}
      onCancel={() => setRejecting(null)}
      cancelLabel="Keep it"
      className="mt-2"
    />
  )

  const itemControls = (key: string, s: ObjectiveSection | NextStepSection | AskSection) => (
    <>
      <button type="button" data-testid={`strategist-not-this-${key}`} onClick={() => { h.tap(); setRejecting(rejecting === key ? null : key) }} className={NOT_THIS}>
        Not this
      </button>
      <WhyBadge why={STRATEGIST_SURFACE.why(whyRow(s))} label={STRATEGIST_SURFACE.label} />
    </>
  )

  const take = async (o: ObjectiveSection, key: string) => {
    if (busy) return
    setBusy(key)
    try {
      const r = await onTakeObjective(o)
      if (r === 'saved') {
        mark(key, 'taken')
        void postVerdict({ suggestion_id: o.suggestion_id ?? null, verdict: 'accepted', final: { text: o.text } })
      } else if (r === 'handed') {
        mark(key, 'taken')
      }
    } finally {
      setBusy(null)
    }
  }

  const contact = async (a: AskSection, key: string) => {
    const person = reachablePerson(a.to)
    if (!person) return
    const action = contactAction(person, a.message, { role: person.title, company: person.company })
    let copied = true
    if (action.copies) copied = await copyText(a.message)
    if (action.href) window.open(action.href, action.kind === 'email' ? '_self' : '_blank', 'noopener')
    say(key, copied ? action.note : 'Could not reach the clipboard. Select the message and copy it by hand.')
    // One verdict per item. The move's was written when he made it today's
    // ask, so contacting after that writes nothing more.
    if (!answered[key]) {
      mark(key, 'taken')
      void postVerdict({ suggestion_id: a.suggestion_id ?? null, verdict: 'accepted', final: { channel: action.kind } })
    }
  }

  const copy = async (key: string, text: string, what = 'Copied.') => {
    const ok = await copyText(text)
    say(key, ok ? what : 'Could not reach the clipboard. Select the words and copy them by hand.')
  }

  const setGoal = async (p: ProgressSection, key: string) => {
    const action = PROGRESS_WORD[p.verdict].action
    if (busy || !action) return
    if (action.confirm && armed !== key) { h.impactRigid(); setArmed(key); return }
    setArmed(null)
    setBusy(key)
    try {
      await patchGoal({ goalId: p.goal_id, status: action.status })
      mark(key, 'taken')
      h.success()
    } catch (e) {
      h.error()
      say(key, failureMessage(e, 'Could not save that.'))
    } finally {
      setBusy(null)
    }
  }

  const move = parts.asks[0] ?? null
  const otherAsks = parts.asks.slice(1)

  return (
    <div className="flex flex-col gap-6 min-w-0" data-testid="strategist-read" data-complete={complete ? 'true' : 'false'}>
      {parts.headline && (
        <section data-testid="strategist-headline" className="min-w-0">
          {inline ? (
            <>
              <p className="text-ui font-semibold leading-snug text-ink break-words">{parts.headline.text}</p>
              <p className="mt-1 text-micro text-ink-faint break-words">{ruleSource(parts.headline.rule, parts.headline.rule_n)}</p>
            </>
          ) : (
            <Claim
              size={narrow ? 'lede' : 'title'}
              compact={narrow}
              source={ruleSource(parts.headline.rule, parts.headline.rule_n)}
            >
              {parts.headline.text}
            </Claim>
          )}
        </section>
      )}

      {parts.heard && (
        <section data-testid="strategist-heard" className="flex flex-col gap-1.5 min-w-0">
          <Eyebrow>What Marcus heard</Eyebrow>
          <p className="text-body leading-relaxed text-ink break-words">{parts.heard.text}</p>
          {parts.heard.trap_chip && (
            <p className="text-label leading-relaxed text-ink-muted break-words">
              <span className="text-ink">{parts.heard.trap_chip}.</span>
              {parts.heard.counter_move ? ` ${parts.heard.counter_move}` : ''}
            </p>
          )}
        </section>
      )}

      {parts.lenses.length > 0 && (
        <section className="flex flex-col gap-3 min-w-0" aria-label="What a strategist would check">
          <Eyebrow>What is missing</Eyebrow>
          <ul className="flex flex-col gap-3">
            {parts.lenses.map(l => (
              <li key={l.lens} data-testid={`strategist-lens-${l.lens}`} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 flex flex-col gap-1.5 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-ui font-semibold text-ink">{l.label}</span>
                  <span className={`text-micro px-1.5 py-0.5 rounded ${l.status === 'move' ? 'bg-violet-500/15 text-violet-200' : 'bg-white/[0.06] text-ink-faint'}`}>
                    {STATUS_WORD[l.status]}
                  </span>
                </div>
                <p className="text-body leading-relaxed text-ink-muted break-words">{l.read}</p>
                {l.missing && (
                  <p className="text-body leading-relaxed text-ink break-words">
                    <span className="text-ink-muted">What you could be missing: </span>{l.missing}
                  </p>
                )}
                {l.move && (
                  <div className="mt-1 rounded-lg border border-violet-400/20 bg-violet-500/[0.05] px-3 py-2 flex flex-col gap-1">
                    <p className="text-body leading-relaxed text-ink break-words">{l.move.text}</p>
                    <p className="text-micro text-ink-faint break-words">
                      {[
                        l.move.by ? `By ${shortDay(l.move.by)}` : null,
                        l.move.job ? jobLabel(l.move.job) : null,
                        l.move.target === 'investor' ? 'Investor' : l.move.target === 'cofounder' ? 'Co-founder' : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {l.move.job_note && <p className="text-label text-ink-muted leading-relaxed break-words">{l.move.job_note}</p>}
                  </div>
                )}
                <p className="text-micro text-ink-faint break-words">{l.source}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parts.reframe && (
        <section data-testid="strategist-reframe" className="flex flex-col gap-1.5 min-w-0">
          <Eyebrow>{parts.reframe.direction === 'outward' ? 'Written outward' : 'Written inward'}</Eyebrow>
          <p className="text-body leading-relaxed text-ink-muted break-words">{parts.reframe.why}</p>
          {parts.reframe.wording && (
            <div className="flex flex-wrap items-start gap-2">
              <p className="flex-1 min-w-0 text-body leading-relaxed text-ink break-words">{parts.reframe.wording}</p>
              <button type="button" onClick={() => void copy('reframe', parts.reframe!.wording!, 'Wording copied.')} className={BTN_QUIET}>
                <Copy size={12} /> Copy
              </button>
            </div>
          )}
          {saidLine('reframe')}
        </section>
      )}

      {parts.progress.length > 0 && (
        <section className="flex flex-col gap-2 min-w-0" aria-label="Where the week stands">
          <Eyebrow>Where the week stands</Eyebrow>
          <ul className="flex flex-col gap-2">
            {parts.progress.map((p, i) => {
              const key = `progress-${i}`
              const w = PROGRESS_WORD[p.verdict]
              const done = answered[key] === 'taken'
              const status = liveStatus(p.goal_id)
              // Offered only while the objective is still active now.
              const offer = w.action && status === 'active'
              return (
                <li key={key} data-testid={`strategist-progress-${i}`} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 flex flex-col gap-1.5 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-body text-ink break-words">{p.goal_title}</span>
                    <span className="text-micro text-ink-faint">{w.label}</span>
                  </div>
                  <p className="text-label leading-relaxed text-ink-muted break-words">{p.why}</p>
                  {w.note && <p className="text-label leading-relaxed text-ink-faint break-words">{w.note}</p>}
                  {w.action && (
                    <div>
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-label text-ink-muted"><Check size={12} /> {w.action.done}</span>
                      ) : offer ? (
                        <button type="button" data-testid={`strategist-progress-act-${i}`} disabled={busy != null} onClick={() => void setGoal(p, key)} className={BTN_QUIET}>
                          {busy === key ? <Working size={12} /> : null}
                          {armed === key && w.action.confirm ? w.action.confirm : w.action.label}
                        </button>
                      ) : status && status !== 'active' ? (
                        <span className="text-label text-ink-faint">{status === 'done' ? 'Already marked done.' : 'Already off the list.'}</span>
                      ) : null}
                    </div>
                  )}
                  {saidLine(key)}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {parts.objectives.length > 0 && (
        <section className="flex flex-col gap-2 min-w-0" aria-label="Objectives for the week">
          <Eyebrow>Objectives for the week</Eyebrow>
          <ul className="flex flex-col gap-2">
            {parts.objectives.map((o, i) => {
              const key = `objective-${i}`
              const state = answered[key] ?? (inWeek.has(norm(o.text)) ? 'taken' : undefined)
              if (state === 'set_aside') return null
              return (
                <li key={key} data-testid={`strategist-objective-${i}`} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 flex flex-col gap-1.5 min-w-0">
                  <p className="text-body leading-relaxed text-ink break-words">{o.text}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-ink-faint">
                    <span className="inline-flex items-center gap-1 min-w-0"><Target size={10} className="opacity-60 shrink-0" /><span className="break-words">{o.serves_title}</span></span>
                    <span className="px-1 py-0.5 rounded bg-white/[0.06]">{jobLabel(o.job)}</span>
                    {o.play && <span className="px-1 py-0.5 rounded bg-violet-500/15 text-violet-200">The bold one</span>}
                  </p>
                  <p className="text-label leading-relaxed text-ink-muted break-words">{o.why}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {state === 'taken' ? (
                      <span className="inline-flex items-center gap-1 text-label text-ink-muted"><Check size={12} /> In this week</span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`strategist-take-${i}`}
                        disabled={busy != null}
                        onClick={() => void take(o, key)}
                        className={BTN_PRIMARY}
                      >
                        {busy === key ? <Working size={12} /> : null}Take it
                      </button>
                    )}
                    {state !== 'taken' && itemControls(key, o)}
                  </div>
                  {rejectBar(key, o.suggestion_id)}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {parts.next_steps.length > 0 && (() => {
        const step = (n: NextStepSection, i: number) => {
              const key = `next-${i}`
              if (answered[key] === 'set_aside') return null
              return (
                <li key={key} data-testid={`strategist-next-${i}`} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 flex flex-col gap-1.5 min-w-0">
                  {(n.thread || n.minutes) && (
                    <p className="text-label text-ink-faint break-words">{[n.thread, n.minutes ? minutesLabel(n.minutes) : null].filter(Boolean).join(' · ')}</p>
                  )}
                  <p className="text-body leading-relaxed text-ink break-words">{n.text}</p>
                  {/* A daily move carries who it is about and why today (ADR-028). */}
                  {n.person && (
                    <p className="text-label leading-snug text-ink-muted break-words">
                      {[n.person.name, n.person.title && n.person.company ? `${n.person.title} at ${n.person.company}` : (n.person.title || n.person.company || '')].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {n.why && <p className="text-label leading-relaxed text-ink-muted break-words">{n.why}</p>}
                  {/* The ledger's word on this step, when it has one: what
                      happened, not what he thought (ADR-030). */}
                  {n.suggestion_id && outcomes?.[n.suggestion_id] && (
                    <p className="text-label leading-snug text-ink-faint break-words" data-testid={`strategist-next-${i}-outcome`}>
                      {OUTCOME_WORDS[outcomes[n.suggestion_id].outcome]}
                    </p>
                  )}
                  {n.draft_url && (
                    <a href={n.draft_url} target="_blank" rel="noopener noreferrer" className={`${BTN_QUIET} self-start`}>
                      <ArrowUpRight size={12} /> Open draft
                    </a>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <PutOnToday
                      index={i}
                      step={n}
                      taken={answered[key] === 'taken'}
                      onSay={line => say(key, line)}
                      onPut={() => {
                        mark(key, 'taken')
                        void postVerdict({ suggestion_id: n.suggestion_id ?? null, verdict: 'accepted', final: { text: n.text } })
                      }}
                    />
                    {answered[key] !== 'taken' && itemControls(key, n)}
                  </div>
                  {saidLine(key)}
                  {rejectBar(key, n.suggestion_id)}
                </li>
              )
        }
        const plan = planGroups(parts.next_steps)
        if (plan) {
          // The battle plan (week_open and update): small timed steps, now,
          // then today, then this week, each tagged with its thread.
          return (
            <section data-testid="strategist-plan" className="flex flex-col gap-4 min-w-0" aria-label="Battle plan">
              {plan.map(g => (
                <div key={g.when} data-testid={`strategist-plan-${g.when}`} className="flex flex-col gap-2 min-w-0">
                  <Eyebrow>{PLAN_LABEL[g.when]}{g.minutes ? ` · ${minutesLabel(g.minutes)}` : ''}</Eyebrow>
                  <ul className="flex flex-col gap-2">{g.items.map(({ n, i }) => step(n, i))}</ul>
                </div>
              ))}
            </section>
          )
        }
        return (
          <section className="flex flex-col gap-2 min-w-0" aria-label={read?.shape === 'daily' ? 'Today\'s moves' : 'Next steps'}>
            <Eyebrow>{read?.shape === 'daily' ? 'Today\'s moves, best first' : 'Next steps'}</Eyebrow>
            <ul className="flex flex-col gap-2">{parts.next_steps.map((n, i) => step(n, i))}</ul>
          </section>
        )
      })()}

      {parts.worry && <WorryHandoff worry={parts.worry} />}

      {parts.kill && (
        <section data-testid="strategist-kill" className="flex flex-col gap-1.5 min-w-0">
          <Eyebrow>What would end it</Eyebrow>
          <p className="text-body leading-relaxed text-ink break-words">{parts.kill.text}</p>
          <p className="text-micro text-ink-faint">Check by {shortDay(parts.kill.by)}</p>
        </section>
      )}

      {parts.learning && (
        <section data-testid="strategist-learning" className="flex flex-col gap-1.5 min-w-0">
          <Eyebrow>What the week taught</Eyebrow>
          <p className="text-body leading-relaxed text-ink break-words">{parts.learning.text}</p>
        </section>
      )}

      {otherAsks.length > 0 && (
        <section className="flex flex-col gap-2 min-w-0" aria-label="Other asks">
          <Eyebrow>Other asks</Eyebrow>
          <ul className="flex flex-col gap-2">
            {otherAsks.map((a, j) => {
              const i = j + 1
              const key = `ask-${i}`
              if (answered[key] === 'set_aside') return null
              return (
                <li key={key} data-testid={`strategist-ask-${i}`} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 flex flex-col gap-2 min-w-0">
                  <AskBody ask={a} />
                  <div className="flex flex-wrap items-center gap-2">
                    <ContactButtons ask={a} testId={`strategist-contact-${i}`} onContact={() => void contact(a, key)} onCopy={() => void copy(key, a.message, 'Message copied.')} />
                    {itemControls(key, a)}
                  </div>
                  {saidLine(key)}
                  {rejectBar(key, a.suggestion_id)}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {move && answered['ask-0'] !== 'set_aside' && (
        <section data-testid="strategist-move" className="flex flex-col gap-3 min-w-0">
          <Eyebrow tone="accent">The one move</Eyebrow>
          <AskBody ask={move} />
          {/* Before it is today's ask: only Copy and the item's own controls.
              The words, then HIS guess (AskCard), then contact, then "I
              sent it": the manual's test is a prediction made before the
              outcome, and a contact button above the guess let the ask go out
              with no prediction and no log. */}
          <div className="flex flex-wrap items-center gap-2">
            {answered['ask-0'] === 'taken' && !inline ? (
              <ContactButtons ask={move} testId="strategist-contact-0" onContact={() => void contact(move, 'ask-0')} onCopy={() => void copy('ask-0', move.message, 'Message copied.')} />
            ) : (
              <button type="button" data-testid="strategist-copy-0" onClick={() => void copy('ask-0', move.message, 'Message copied.')} className={BTN_QUIET}>
                <Copy size={12} /> Copy the message
              </button>
            )}
            {answered['ask-0'] !== 'taken' && itemControls('ask-0', move)}
          </div>
          {saidLine('ask-0')}
          {rejectBar('ask-0', move.suggestion_id)}
          {complete && !inline && (
            <AskCard
              variant={narrow ? 'mobile' : 'desktop'}
              hideUnresolved
              seed={{ text: askSeedText(move), suggestionId: move.suggestion_id ?? null }}
              onCommitted={(finalText) => {
                // One verdict per item: a second commit of the same move
                // (Replace today's ask after an edit) writes nothing more.
                if (answered['ask-0']) return
                const offered = askSeedText(move)
                const verdict = verdictForTaken(offered, finalText)
                mark('ask-0', 'taken')
                void postVerdict({
                  suggestion_id: move.suggestion_id ?? null,
                  verdict,
                  final: { ask_text: finalText },
                  delta: verdict === 'accepted' ? null : editDelta(offered, finalText),
                })
              }}
            />
          )}
          {complete && inline && (
            <p data-testid="strategist-move-home" className="text-label leading-relaxed text-ink-muted break-words">
              Make it today&rsquo;s ask on Home, with your own guess, once the ritual is done.
            </p>
          )}
          {parts.close && (
            <p data-testid="strategist-close" className="text-label leading-relaxed text-ink-muted break-words">
              <span className="text-ink">Where to stop: </span>{parts.close.stop}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────────

function AskBody({ ask }: { ask: AskSection }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className="text-label text-ink-muted break-words">To {recipientLine(ask.to)}</p>
      <p className="text-ui font-semibold leading-snug text-ink break-words">{ask.line}</p>
      <p className="text-body leading-relaxed text-ink-muted whitespace-pre-wrap break-words">{ask.message}</p>
      <p className="text-label leading-relaxed text-ink-muted break-words">{ask.why}</p>
      {/* The ladder in words, never a percentage: his guess is his own. */}
      <div data-testid="strategist-ladder" className="text-label leading-relaxed text-ink-faint break-words">
        <p>How big an ask: {ask.ladder.request}, step {ask.ladder.level} of 12.</p>
        <p>It can feel like: {ask.ladder.feared}.</p>
        <p>Whatever the answer: {ask.ladder.learning}.</p>
      </div>
      {ask.job_note && <p className="text-label leading-relaxed text-ink-muted break-words">{ask.job_note}</p>}
    </div>
  )
}

function ContactButtons({ ask, testId, onContact, onCopy }: {
  ask: AskSection
  testId: string
  onContact: () => void
  onCopy: () => void
}) {
  const person = reachablePerson(ask.to)
  if (!person) {
    return (
      <button type="button" onClick={onCopy} className={BTN_QUIET}>
        <Copy size={12} /> Copy the message
      </button>
    )
  }
  const action = contactAction(person, ask.message, { role: person.title, company: person.company })
  const Icon = action.kind === 'email' ? Mail : action.kind === 'linkedin' ? Linkedin : Copy
  return (
    <>
      <button type="button" data-testid={testId} onClick={onContact} className={BTN_PRIMARY}>
        <Icon size={12} /> {action.label}
      </button>
      {action.kind !== 'clipboard' && (
        <button type="button" onClick={onCopy} className={BTN_QUIET}>
          <Copy size={12} /> Copy
        </button>
      )}
    </>
  )
}

/** "Put on today": the first empty slot of today's 3, never an overwrite. */
function PutOnToday({ index, step, taken, onPut, onSay }: {
  index: number
  step: NextStepSection
  taken: boolean
  onPut: () => void
  /** A line to show under the step, for a full day or a failed save. */
  onSay: (line: string) => void
}) {
  const { today, refresh } = useDailyFocus()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const [slot, setSlot] = useState<number | null>(null)

  if (taken) {
    return (
      <span className="inline-flex items-center gap-1 text-label text-ink-muted">
        <Check size={12} /> {slot ? `On today, slot ${slot}` : 'On today'}
      </span>
    )
  }

  const put = async () => {
    const t = today as unknown as Record<string, unknown> | null
    const free = ([1, 2, 3] as const).find(n => !String(t?.[`target_${n}_text`] ?? '').trim())
    if (!free) { onSay("Today's 3 are full. Finish one first, or edit a slot on Home."); return }
    setBusy(true)
    try {
      await requestOk('/api/daily-focus/slot', {
        method: 'POST',
        body: {
          date: (t?.focus_date as string | undefined) ?? civilYmd(new Date()),
          slot: free,
          text: step.text.slice(0, 240),
          goal_id: step.goal_id,
          job: step.job,
        },
        timeoutMs: 12_000,
      })
      setSlot(free)
      refresh()
      h.success()
      onPut()
    } catch (e) {
      h.error()
      onSay(failureMessage(e, 'Could not put it on today.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" data-testid={`strategist-put-today-${index}`} disabled={busy} onClick={() => void put()} className={BTN_PRIMARY}>
      {busy ? <Working size={12} /> : <ListChecks size={12} />} Put on today
    </button>
  )
}

/** The worry he named, through the worry compiler's compile step (it writes nothing). */
function WorryHandoff({ worry }: { worry: WorrySection }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Compilation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const compile = async () => {
    setBusy(true)
    setError(null)
    try {
      const j = await requestOk<{ ok?: boolean; error?: string; compilation?: Compilation }>(
        `/api/pilot/worries?tz=${encodeURIComponent(getZone())}`,
        { method: 'POST', body: { action: 'compile', raw_text: worry.text.slice(0, 4000) }, timeoutMs: 45_000 },
      )
      if (!j.compilation) throw new Error('The compiler sent nothing back.')
      setResult(j.compilation)
    } catch (e) {
      setError(failureMessage(e, 'Could not compile that worry.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-testid="strategist-worry" className="flex flex-col gap-1.5 min-w-0">
      <Eyebrow>A worry you named</Eyebrow>
      <p className="text-body leading-relaxed text-ink-muted whitespace-pre-wrap break-words">{worry.text}</p>
      {result ? (
        <div data-testid="strategist-worry-result" className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 flex flex-col gap-1">
          <p className="text-body leading-relaxed text-ink break-words">{compiledLine(result)}</p>
          {result.reasoning && <p className="text-label leading-relaxed text-ink-muted break-words">{result.reasoning}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="strategist-compile-worry" disabled={busy} onClick={() => void compile()} className={BTN_QUIET}>
            {busy ? <Working size={12} /> : <ArrowUpRight size={12} />} Compile this worry
          </button>
          {error && <span className="text-label text-ink-muted">{error}</span>}
        </div>
      )}
    </section>
  )
}

/** One plain sentence for what the compiler made of it. */
export function compiledLine(c: Compilation): string {
  switch (c.state) {
    case 'test':
      return c.prediction
        ? `A prediction you can test: ${c.prediction}${c.test_due_date ? `, checked by ${shortDay(c.test_due_date)}` : ''}.`
        : 'A prediction you can test.'
    case 'action':
      return c.action_text ? `One thing to do: ${c.action_text}` : 'One thing to do.'
    case 'relitigation':
      return c.original_decision ? `Already decided: ${c.original_decision}` : 'Already decided.'
    case 'weather':
      return c.label ? `Weather: ${c.label}. It passes on its own.` : 'Weather. It passes on its own.'
    default:
      return 'Compiled.'
  }
}

// ── the read with its wait and its failure ───────────────────────────────────

const STAGE_INDEX: Record<StrategistStage, number> = { grounding: 0, thinking: 1, writing: 2, saving: 3 }

/**
 * A run as it streams, or the stored read when nothing is running here.
 *
 * The wait is rung 3 of the loading ladder (DESIGN_SYSTEM.md): over ten
 * seconds, so it owns its region with the stage the SERVER says it is on (not
 * a timer), the elapsed clock and the expected time. The host is the exit
 * (the sheet's Close, the ritual's Back). The first streamed section replaces
 * the wait, and the rest arrive beneath it: the one recorded exception to
 * rung 3, because a read that is already half on screen is not a wait.
 */
export function ReadView({
  state,
  stored,
  workKey,
  narrow,
  inline = false,
  onTakeObjective,
  onRetry,
  objectivesOnly = false,
  alreadyIn,
  testId,
}: {
  state: StrategistRunState
  /** The latest stored read, shown while nothing runs in this view. */
  stored?: StrategistReadWire | null
  workKey: 'strategist.read' | 'strategist.goal'
  narrow: boolean
  /** Inside the ritual: the wait is a line, not a block. */
  inline?: boolean
  onTakeObjective: Props['onTakeObjective']
  onRetry?: () => void
  objectivesOnly?: boolean
  alreadyIn?: string[]
  testId?: string
}) {
  const work = useWork(workKey)
  const running = state.status === 'running'
  const elapsed = useElapsed(running)
  const stageLine = state.stage && work.stages ? work.stages[STAGE_INDEX[state.stage]] ?? null : null

  if (state.status === 'idle') {
    if (!stored?.read) return null
    const when = relativeTime(stored.created_at)
    return (
      <div className="flex flex-col gap-3 min-w-0" data-testid={testId}>
        {when && <p className="text-micro text-ink-faint">Read {when}</p>}
        <StrategistRead read={stored.read} sections={[]} narrow={narrow} onTakeObjective={onTakeObjective} objectivesOnly={objectivesOnly} inline={inline} alreadyIn={alreadyIn} />
      </div>
    )
  }

  const hasSections = state.read !== null || state.sections.length > 0

  return (
    <div className="flex flex-col gap-4 min-w-0" data-testid={testId} data-status={state.status}>
      {running && !hasSections && (
        inline
          ? <Pending label={work.label} stage={stageLine} elapsedMs={elapsed} expectedMs={work.expectedMs} />
          : (
            <div data-testid="strategist-pending">
              <Pending variant="block" className="!pb-4" label={work.label} stage={stageLine} elapsedMs={elapsed} expectedMs={work.expectedMs} />
              {work.sub && <p className="pb-4 text-center text-micro text-ink-faint">{work.sub}</p>}
            </div>
          )
      )}

      {state.status === 'failed' && (
        <div data-testid="strategist-error" role="alert" className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3 flex flex-col gap-2">
          <p className="text-body leading-relaxed text-ink break-words">{state.error}</p>
          {onRetry && (
            <div>
              <button type="button" data-testid="strategist-retry" onClick={onRetry} className={BTN_QUIET}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {hasSections && (
        <>
          {state.status === 'failed' && state.sections.length > 0 && (
            <p className="text-micro text-ink-faint leading-relaxed">This much came through before it stopped. The read was not saved, but anything you take from it here still is.</p>
          )}
          <StrategistRead read={state.read} sections={state.sections} narrow={narrow} onTakeObjective={onTakeObjective} objectivesOnly={objectivesOnly} inline={inline} alreadyIn={alreadyIn} />
          {running && <Pending label={work.label} stage={stageLine} elapsedMs={elapsed} expectedMs={work.expectedMs} />}
          {state.status === 'ready' && state.persisted === false && (
            <p data-testid="strategist-not-kept" className="text-micro text-ink-faint leading-relaxed">
              This read could not be kept, so it shows here only until you close it. It will not run again by itself.
            </p>
          )}
        </>
      )}
    </div>
  )
}
