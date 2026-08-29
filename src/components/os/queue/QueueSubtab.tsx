import React from 'react'
import { DecisionsInbox } from './DecisionsInbox'
import { CalibrationCard } from './CalibrationCard'
import { MobileShell, TabHeader } from '../../mobile/primitives'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * OS → Queue: the one place every typed ruling waits. Relocated whole from
 * Home (2026-08-20 recompose) so Home can hold the objective canon; the
 * inbox, deck, ruling prompts, stale tail and backburner all live here now.
 * Home links in via its vitals count; legacy #/today?task= / ?decision=
 * deep links alias here with their params intact.
 */
export function QueueSubtab({
  narrow,
  onNavigate,
  deepTask = null,
  deepDecision = null,
}: {
  narrow: boolean
  onNavigate?: NavigateFn
  deepTask?: string | null
  deepDecision?: string | null
}) {
  if (narrow) {
    return (
      <MobileShell header={<TabHeader title="Queue" subtitle="Every ruling waiting on you." />}>
        <DecisionsInbox onNavigate={onNavigate} deepTask={deepTask} deepDecision={deepDecision} limit={10} />
        <CalibrationCard />
      </MobileShell>
    )
  }
  return (
    <div className="max-w-[1280px] mx-auto w-full flex flex-col gap-4">
      <DecisionsInbox onNavigate={onNavigate} deepTask={deepTask} deepDecision={deepDecision} limit={10} />
      <CalibrationCard />
    </div>
  )
}
