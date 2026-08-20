import React, { useEffect, useState } from 'react'
import type { PilotMode } from '../../types/pilot'
import { usePilotState } from '../../hooks/usePilot'
import { intentByKey, type Intent } from '../../lib/pilotIntent'
import { PilotStateProvider } from '../../contexts/PilotStateContext'
import { civilHour } from '../../lib/civilDate'
import { MorningCheckin } from './MorningCheckin'
import { RedMode } from './RedMode'

// Wraps the entire app. During the morning window nothing renders behind it
// until today's check-in exists, and on a red day nothing renders behind it
// until either a ship is logged or the escape hatch is taken.
//
// Fails OPEN, three ways over. If the pilot routes are unreachable the dashboard
// renders untouched. If it is past midday the dashboard renders untouched. If
// the check-in is skipped the dashboard renders untouched. A morning ritual
// that can lock the operator out of his own control center has stopped being a
// ritual and become a login.

/**
 * The morning window, in the operator's own civil hours.
 *
 * This replaces a 20-hour rolling suppression on the last check-in, which was
 * measured from when the last one HAPPENED rather than from the civil day, and
 * silently ate the next morning whenever a check-in landed after about midday.
 * The evidence was in the data: a check-in filed 19:25 UTC on the 8th suppressed
 * the gate until 15:25 on the 9th, and the 9th has no row. Same shape on the
 * 5th. Days went missing without anything ever telling him why.
 *
 * A window fixes that and answers the other half at the same time. Krish: "if I
 * have not logged in by midday then it just goes straight to the dash." Midday
 * is the close. The 04:00 open is what the rolling window was really for: the
 * civil day can roll over while he is mid-session, and without a floor the gate
 * would appear at midnight over a session already in progress. Nobody starts
 * their morning at 00:30, so the floor costs nothing and the rollover stops
 * being a special case.
 */
const MORNING_OPENS_AT = 4
const MORNING_CLOSES_AT = 12

interface Props {
  children: React.ReactNode
  /** Called once, after a check-in, with the surface the day is for. */
  onIntent?: (intent: Intent) => void
}

export function PilotGate({ children, onIntent }: Props) {
  const { state, loading, error, refresh } = usePilotState()
  const [unlocked, setUnlocked] = useState(false)
  const [justChose, setJustChose] = useState<PilotMode | null>(null)
  const [routed, setRouted] = useState(false)

  // Read once, at mount, and hold it for the session. Re-reading live would
  // yank a half-answered check-in off the screen the moment the clock struck
  // twelve, and would re-gate at midnight on a session that has been open since
  // the evening. The window decides whether this VISIT is a morning; it is not
  // a live clock.
  const [inMorningWindow] = useState(() => {
    const h = civilHour()
    return h >= MORNING_OPENS_AT && h < MORNING_CLOSES_AT
  })

  // Route to the day's intent once, after the gate clears. Only on a green day:
  // red mode owns the screen and must not be navigated out from under.
  const savedIntent = intentByKey(state?.morning?.intent)
  const mode: PilotMode | null = justChose ?? state?.morning?.mode ?? null
  useEffect(() => {
    if (routed || !onIntent || !savedIntent) return
    if (mode !== 'green') return
    setRouted(true)
    onIntent(savedIntent)
  }, [routed, onIntent, savedIntent, mode])

  // Declare readiness the moment this gate stops being the reason nothing is on
  // screen. The splash in index.html holds until this attribute appears, so the
  // brand mark keeps breathing over its own orbit for exactly as long as the
  // pilot read takes, then exhales into real content. Before this, the splash
  // hid on React's first commit — which ToastProvider satisfies with an empty
  // toast container — so a cold load went splash, blank, content.
  //
  // Set from an effect, so it lands AFTER the first paint of whatever renders
  // below: the splash is only removed once there is something behind it.
  useEffect(() => {
    if (loading) return
    document.documentElement.setAttribute('data-app-ready', '')
  }, [loading])

  // Nothing paints behind a held splash, so this stays `null` rather than
  // becoming a second loading screen. The two are one mechanism: the splash IS
  // the boot state, and it is already the right one (a breathing mark with a
  // particle orbiting it is the house language for "getting ready for you").
  // Changing this to render anything means changing index.html too.
  if (loading) return null
  // Fails open: an unreachable pilot service renders the dashboard untouched,
  // with no provider, which resolves every consumer to `steady`.
  if (error || !state) return <>{children}</>

  // Today's civil date is the only thing that counts as answered. Skipping
  // writes a row too, so a skip closes today and nothing else: tomorrow the
  // gate is back, which is the whole point of it being skippable rather than
  // dismissible.
  const answered = Boolean(state.morning)

  if (!answered && inMorningWindow) {
    return (
      <MorningCheckin
        yesterday={state.yesterday}
        today={state.today}
        onDone={(next, intent) => {
          setJustChose(next)
          if (next === 'green' && intent) { setRouted(true); onIntent?.(intent) }
          refresh()
        }}
      />
    )
  }

  // A logged override on today's row survives a reload, so the escape hatch is
  // taken once per day rather than once per page load.
  const overrodeToday = Boolean(state.morning?.override_at)

  if (mode === 'red' && !unlocked && !overrodeToday) {
    return (
      <RedMode
        lastEvening={state.last_evening}
        onUnlock={() => { setUnlocked(true); refresh() }}
      />
    )
  }

  // The reading reaches the dashboard from here. Before the capacity layer this
  // returned bare children and the state died at the gate.
  return <PilotStateProvider morning={state.morning}>{children}</PilotStateProvider>
}
