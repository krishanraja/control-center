import React, { useState } from 'react'
import { AlertTriangle } from '@/lib/icons'
import { useCriticalAlerts } from '../hooks/useCriticalAlerts'
import { useFleetLiveness } from '../hooks/useFleetLiveness'
import { useMoodSource } from './shared/AmbientField'
import { humanAge } from '../lib/ageHelpers'

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

export function CriticalAlertBanner() {
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
  if (!visible) return null

  const dismiss = () => {
    writeDismissed(signature)
    setDismissedSig(signature)
  }

  // One line, always. The banner's whole job is to say "something is on fire,
  // look now" and then get out of the way on a tap; the depth is one door over,
  // on Intel. No detail body, no "+N more", no navigation of its own.
  const line = fleetSilent
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

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Dismiss critical alert"
      className="group relative flex w-full flex-shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border border-command-border bg-command-surface py-2.5 pl-4 pr-3 text-left transition-colors hover:bg-command-card active:scale-[0.99]"
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-status-blocked" aria-hidden />
      <AlertTriangle size={16} className="flex-shrink-0 text-status-blocked" aria-hidden />
      <span className="flex-shrink-0 text-micro font-semibold uppercase tracking-[0.14em] text-rose-300">
        Critical
      </span>
      <span className="min-w-0 flex-1 truncate text-body text-white/90">{line}</span>
    </button>
  )
}
