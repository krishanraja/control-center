import React from 'react'
import { MobileShell as MobileShellPrim, TabHeader } from './primitives'
import { TriagePanel } from '../TriagePanel'

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function MobileTriage({ onNavigate }: Props) {
  return (
    <MobileShellPrim>
      <TabHeader title="Triage" subtitle="Agent suggestions awaiting your call" />
      <div className="px-4 pb-8">
        <TriagePanel onNavigate={onNavigate} />
      </div>
    </MobileShellPrim>
  )
}
