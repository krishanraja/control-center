import React from 'react'
import { AlertTriangle } from '@/lib/icons'
import { useCriticalAlerts } from '../hooks/useCriticalAlerts'
import { useFleetLiveness } from '../hooks/useFleetLiveness'
import { useMoodSource } from './shared/AmbientField'
import { humanAge } from '../lib/ageHelpers'

export function CriticalAlertBanner() {
  const { alerts } = useCriticalAlerts()
  // Silence is its own alarm. `alerts` comes from silent_failures, which is
  // written BY the fleet, so a fleet that has stopped writing produces an empty
  // alert list rather than a loud one. That is exactly how a sixteen-day outage
  // went unseen. This second signal is computed from the absence of rows, so it
  // survives the recorder dying.
  const fleet = useFleetLiveness()
  const showing = alerts.length > 0 || fleet.isStale
  // When something is genuinely on fire, the whole app's ambient field cools to
  // a tense hue — felt before it's read. Highest priority. (Hook runs before the
  // early return to respect the rules of hooks.)
  useMoodSource('critical-alert', showing ? 'tense' : null, 10)
  if (!showing) return null

  // A fleet that has gone quiet outranks any single workflow failure: it means
  // the failures being reported are the only ones that still can be.
  if (fleet.isStale && !fleet.loading) {
    return (
      <div className="relative flex-shrink-0 overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 flex items-start gap-3">
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-status-blocked" />
        <AlertTriangle size={18} className="text-status-blocked flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-micro font-semibold uppercase tracking-[0.14em] text-status-blocked">CRITICAL</span>
            <span className="text-micro text-white/40 tabular-nums">fleet silent</span>
          </div>
          <p className="text-body text-white/90 mt-0.5 leading-snug">
            {fleet.lastRunAt
              ? <>No workflow has reported since {humanAge(fleet.lastRunAt)}.</>
              : <>No workflow has ever reported a run.</>}
          </p>
          <p className="text-label text-white/60 mt-1">
            Nothing is recording, so every other health signal on this page is
            unreliable until it recovers. Check the fleet before trusting them.
          </p>
          {alerts.length > 0 && (
            <p className="text-micro text-white/45 mt-1">
              + {alerts.length} workflow alert{alerts.length > 1 ? 's' : ''} recorded before it went quiet
            </p>
          )}
        </div>
      </div>
    )
  }

  const top = alerts[0]
  const extra = alerts.length - 1

  return (
    // Urgent, not candy: a neutral surface with a single clay accent bar + icon
    // carries the alarm; the copy stays near-white and legible.
    <div className="relative flex-shrink-0 overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 flex items-start gap-3">
      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-status-blocked" />
      <AlertTriangle size={18} className="text-status-blocked flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-micro font-semibold uppercase tracking-[0.14em] text-status-blocked">CRITICAL</span>
          <span className="text-micro text-white/40 tabular-nums">tier 4</span>
        </div>
        <p className="text-body text-white/90 mt-0.5 leading-snug">
          {top.workflow_name || top.workflow_id} is down. Detected {humanAge(top.detected_at)}.
        </p>
        {top.detail && (
          <p className="text-label text-white/60 mt-1 line-clamp-2">{top.detail}</p>
        )}
        {extra > 0 && (
          <p className="text-micro text-white/45 mt-1">+ {extra} more critical alert{extra > 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  )
}
