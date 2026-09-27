import { useEffect, useState } from 'react'
import type { NoteKind } from '../types/strategist'
import { civilYmd } from './civilDate'

// Tiny module-level open-state bus for the strategist sheet (ADR-026), the same
// singleton/listener shape as src/lib/focusRitual.ts. The ladder's "Talk it
// through", the phone + sheet, the command palette and the ladder's OS save all
// open one sheet that is mounted once at App level, so nothing threads open
// state through the shells.
//
//   { mode: 'talk' }                 say how it is going (a note)
//   { mode: 'goal', goalId }         read one goal
//
// `fresh` is set by the ladder right after it saved or retitled the OS goal:
// the goal just changed, so the sheet reads it now instead of showing the last
// read of the old wording.

export type StrategistMode = 'talk' | 'goal'

export interface StrategistOpen {
  open: boolean
  mode: StrategistMode
  goalId: string | null
  /** Preselects the note's kind. Absent: inferred from the day. */
  kind: NoteKind | null
  fresh: boolean
  /** Bumps on every open, so a host can tell a reopen from a re-render. */
  nonce: number
}

let state: StrategistOpen = { open: false, mode: 'talk', goalId: null, kind: null, fresh: false, nonce: 0 }
const listeners = new Set<() => void>()
function notify() { for (const l of listeners) l() }

export function openStrategist(opts: {
  mode: StrategistMode
  goalId?: string | null
  kind?: NoteKind | null
  fresh?: boolean
}): void {
  state = {
    open: true,
    mode: opts.mode,
    goalId: opts.mode === 'goal' ? opts.goalId ?? null : null,
    kind: opts.kind ?? null,
    fresh: opts.fresh === true,
    nonce: state.nonce + 1,
  }
  notify()
}

export function closeStrategist(): void {
  state = { ...state, open: false, fresh: false }
  notify()
}

export function useStrategistOpen(): StrategistOpen {
  const [, setV] = useState(0)
  useEffect(() => {
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return state
}

// ── A drafted objective on its way to the ritual ────────────────────────────
// "Take it" in the sheet cannot save an objective itself: only the Focus
// Ritual's weekly step creates one, through its own add() and the goal gate
// (ADR-016, ADR-018). So the sheet leaves the wording here, closes, and opens
// the ritual at that step, which takes it once, prefills its composer, and
// records the verdict when he adds it. One slot, taken once: a stale draft
// never reappears on a later open.

export interface PendingObjective {
  text: string
  /** The OS goal it serves (a canon id). */
  serves: string | null
  job: string | null
  suggestionId: string | null
}

let pending: PendingObjective | null = null

export function leaveObjectiveForRitual(o: PendingObjective): void {
  pending = o
}

export function takeObjectiveForRitual(): PendingObjective | null {
  const o = pending
  pending = null
  return o
}

// ── What kind of note it is ─────────────────────────────────────────────────
// Three kinds, one chip row (OptionChips), inferred from the civil day and
// always his to change:
//   Monday, or no objectives set yet this week   starting the week
//   Friday to Sunday                              how the week went
//   otherwise                                     progress
// Monday wins over the weekend rule because it cannot be both; the weekend
// wins over "no objectives yet", because a week that closed with none set is
// still a week to look back on.

export const NOTE_KIND_OPTIONS: Array<{ value: NoteKind; label: string }> = [
  { value: 'week_open', label: 'Starting the week' },
  { value: 'update', label: 'Progress' },
  { value: 'week_close', label: 'How the week went' },
]

export function noteKindLabel(kind: NoteKind): string {
  return NOTE_KIND_OPTIONS.find(o => o.value === kind)?.label ?? 'Progress'
}

/** 0 Sunday to 6 Saturday, for the civil day in the device's zone. */
function civilWeekday(now: Date): number {
  const [y, m, d] = civilYmd(now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

export function inferNoteKind(hasObjectives: boolean, now: Date = new Date()): NoteKind {
  const day = civilWeekday(now)
  if (day === 1) return 'week_open'
  if (day === 5 || day === 6 || day === 0) return 'week_close'
  if (!hasObjectives) return 'week_open'
  return 'update'
}
