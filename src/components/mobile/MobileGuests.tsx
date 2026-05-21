import React from 'react'
import { Mic } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './TabHeader'

export function MobileGuests() {
  return (
    <MobileShell
      header={<TabHeader title="Guests" subtitle="Signal & Noise + Builder Economy" />}
    >
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
        <Mic className="w-6 h-6 text-violet-300 mx-auto mb-2" />
        <p className="text-sm text-white/55">Full Guests pipeline ships in PR 4.</p>
        <p className="text-xs text-white/35 mt-2">Migration, bulk Sheet import, and confirmed-guest cascade are queued.</p>
      </div>
    </MobileShell>
  )
}
