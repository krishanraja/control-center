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
    <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 flex items-start gap-3">
      <AlertTriangle size={18} className="text-rose-300 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-200">CRITICAL</span>
          <span className="text-[11px] text-rose-200/70 tabular-nums">tier 4</span>
        </div>
        <p className="text-[13px] text-rose-50 mt-0.5 leading-snug">
          {top.workflow_name || top.workflow_id} is down. Detected {humanAge(top.detected_at)}.
        </p>
        {top.detail && (
          <p className="text-[12px] text-rose-100/75 mt-1 line-clamp-2">{top.detail}</p>
        )}
        {extra > 0 && (
          <p className="text-[11px] text-rose-200/60 mt-1">+ {extra} more critical alert{extra > 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  )
}
