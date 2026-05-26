import React from 'react'
import { MobileShell as MobileShellPrim, TabHeader } from './primitives'
import { TriagePanel } from '../TriagePanel'

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

// Mobile keeps the big mobile-native TabHeader and asks TriagePanel to skip
// its own — desktop continues to use TriagePanel's compact header so the
// kbd shortcut hint stays inline.
export function MobileTriage({ onNavigate }: Props) {
  return (
    <MobileShellPrim>
      <TabHeader title="Triage" subtitle="Suggestions for your call" />
      <div className="px-4 pb-8">
        <TriagePanel onNavigate={onNavigate} hideHeader />
      </div>
    </MobileShellPrim>
  )
}
