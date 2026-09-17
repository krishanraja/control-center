import React, { useState } from 'react'
import { AlertTriangle } from '@/lib/icons'
import { useCriticalAlerts } from '../hooks/useCriticalAlerts'
import { useFleetLiveness } from '../hooks/useFleetLiveness'
import { useMoodSource } from './shared/AmbientField'
import { humanAge } from '../lib/ageHelpers'
import { SlideOver } from './shared/SlideOver'

// A local dismiss, keyed by WHICH alarm was silenced. Pressing the banner
// silences the alarm in front of you and nothing else: the underlying
// silent_failures row is untouched (the detail still lives on Intel → Systems),
// and the moment a NEW critical failure arrives the signature changes and the
// banner returns. A stray tap can never mute a real outage for good.
const DISMISS_KEY = 'criticalAlert.dismissedSignature'

function readDismissed(): string | null {
  try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
}
function writeDismissed(sig: string) {
  try { localStorage.setItem(DISMISS_KEY, sig) } catch { /* private mode / blocked storage */ }
}

/**
 * The alarm, as data. One reader for the indicator and the drawer, so the dot
 * and the sentence behind it can never disagree about whether anything is
 * wrong.
 */
export function useCriticalAlert() {
  const { alerts } = useCriticalAlerts()
  // Silence is its own alarm. `alerts` comes from silent_failures, which is
  // written BY the fleet, so a fleet that has stopped writing produces an empty
  // alert list rather than a loud one. This second signal is computed from the
  // absence of rows, so it survives the recorder dying.
  const fleet = useFleetLiveness()
  const fleetSilent = fleet.isStale && !fleet.loading

  // A stable fingerprint of the current alarm. Fleet-silence outranks any
  // single workflow failure (it means the failures being reported are the only
  // ones that still can be).
  const signature = fleetSilent
    ? `fleet-silent:${fleet.lastRunAt ?? 'never'}`
    : alerts.length > 0
      ? `alerts:${alerts.map(a => a.id).sort().join(',')}`
      : ''

  const [dismissedSig, setDismissedSig] = useState<string | null>(() => readDismissed())

  const visible = signature !== '' && dismissedSig !== signature

  // When something is genuinely on fire, the whole app's ambient field cools to
  // a tense hue — felt before it's read. Dismissing lifts it too. (Hook runs
  // before the early return to respect the rules of hooks.)
  useMoodSource('critical-alert', visible ? 'tense' : null, 10)

  const dismiss = () => {
    writeDismissed(signature)
    setDismissedSig(signature)
  }

  // One line, always. The alarm's whole job is to say "something is on fire,
  // look now"; the depth is one door over, on Intel. No detail body, no
  // "+N more", no navigation of its own.
  const line = !visible ? null : fleetSilent
    ? (fleet.lastRunAt
        ? `Fleet silent, nothing has reported since ${humanAge(fleet.lastRunAt)}`
        : 'Fleet silent, no workflow has ever reported a run')
    : (() => {
        const top = alerts[0]
        // The Rule 6 tripwire (api/scorecard/friday.ts) is not a workflow that
        // is down; it is a week with build hours nobody asked for. Its detail
        // already reads as a sentence, so the banner says that and not
        // "Rule 6 tripwire is down", which would be untrue.
        if (top.failure_type === 'unasked_hours' && top.detail) {
          return `${top.workflow_name || 'Rule 6 tripwire'}: ${top.detail}`
        }
        return `${top.workflow_name || top.workflow_id} is down (${humanAge(top.detected_at)})`
      })()

  return { visible, line, dismiss }
}

/**
 * The alarm in the top bar: a small mark that appears only when something is
 * on fire, and opens the drawer holding the sentence.
 *
 * Ruling (Krish, 2026-09-17): "Alerts can go into a side drawer that opens
 * from a small alert notification in the top bar, as opposed to taking up
 * extra screen space." It used to be a full-width banner at the top of Home.
 * Its own docstring said "one line, always", but `.truncate` is globally
 * neutralised to protect the complete-copy rule, so the sentence wrapped: on a
 * 360px phone it took 180px of a 640px screen and pushed Today's third slot
 * off the page. A banner that big is not a louder alarm, it is a smaller Home.
 *
 * The dot is not a count. It is the same doorway language the Home doors use:
 * something is wrong, the words are one tap away.
 */
export function CriticalAlertMark({ className = '' }: { className?: string } = {}) {
  const { visible, line, dismiss } = useCriticalAlert()
  const [open, setOpen] = useState(false)
  if (!visible) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="critical-alert-mark"
        aria-label="A critical alert is waiting. Open it."
        className={`relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-command-border bg-command-surface transition-colors hover:bg-command-card active:scale-[0.97] ${className}`}
      >
        <AlertTriangle size={16} className="text-status-blocked" aria-hidden />
        <span
          className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-status-blocked"
          aria-hidden
        />
      </button>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Critical alert"
        label="Critical alert"
      >
        <div className="flex flex-col gap-4" data-testid="critical-alert-drawer">
          <div className="relative overflow-hidden rounded-xl border border-command-border bg-command-surface py-3 pl-4 pr-3">
            <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-status-blocked" aria-hidden />
            <p className="text-micro font-semibold uppercase tracking-[0.14em] text-rose-300">Critical</p>
            {/* No truncate here. The drawer is where the whole sentence goes. */}
            <p className="mt-1.5 text-body text-ink">{line}</p>
          </div>
          <p className="text-label text-ink-muted">
            The detail lives on OS, under Systems. Dismissing silences this alarm
            only. If a new failure arrives, the mark comes back.
          </p>
          <button
            type="button"
            onClick={() => { dismiss(); setOpen(false) }}
            data-testid="critical-alert-dismiss"
            className="min-h-[44px] w-full rounded-xl border border-command-border bg-command-surface text-ui text-ink transition-colors hover:bg-command-card"
          >
            Dismiss this alert
          </button>
        </div>
      </SlideOver>
    </>
  )
}
