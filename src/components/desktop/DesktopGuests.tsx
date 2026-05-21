import React from 'react'
import { Mic } from 'lucide-react'

export function DesktopGuests() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Mic className="w-5 h-5 text-violet-300" />
          <h1 className="text-xl font-semibold">Guests</h1>
        </div>
        <p className="text-sm text-white/50">Signal &amp; Noise and Builder Economy guest pipeline.</p>
      </header>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/55">Full Guests pipeline ships in PR 4.</p>
        <p className="text-xs text-white/35 mt-2">Migration of nell_candidates into the new guests table, bulk Sheet import, and the Nell Guest Confirmed Cascade workflow are all on deck.</p>
      </div>
    </div>
  )
}
