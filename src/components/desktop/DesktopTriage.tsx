import React from 'react'
import { TriagePanel } from '../TriagePanel'

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function DesktopTriage({ onNavigate }: Props) {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <TriagePanel onNavigate={onNavigate} />
    </div>
  )
}
