import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useCriticalAlerts } from '../hooks/useCriticalAlerts'
import { useMoodSource } from './shared/AmbientField'
import { humanAge } from '../lib/ageHelpers'

export function CriticalAlertBanner() {
  const { alerts } = useCriticalAlerts()
  // When something is genuinely on fire, the whole app's ambient field cools to
  // a tense hue — felt before it's read. Highest priority. (Hook runs before the
  // early return to respect the rules of hooks.)
  useMoodSource('critical-alert', alerts.length > 0 ? 'tense' : null, 10)
  if (alerts.length === 0) return null

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
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-status-blocked">CRITICAL</span>
          <span className="text-[11px] text-white/40 tabular-nums">tier 4</span>
        </div>
        <p className="text-[13px] text-white/90 mt-0.5 leading-snug">
          {top.workflow_name || top.workflow_id} is down. Detected {humanAge(top.detected_at)}.
        </p>
        {top.detail && (
          <p className="text-[12px] text-white/60 mt-1 line-clamp-2">{top.detail}</p>
        )}
        {extra > 0 && (
          <p className="text-[11px] text-white/45 mt-1">+ {extra} more critical alert{extra > 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  )
}
