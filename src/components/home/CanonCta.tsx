import React from 'react'
import { ArrowRight } from 'lucide-react'
import type { CanonCta as Cta } from '../../hooks/useAltitudes'
import { openFocusRitual } from '../../lib/focusRitual'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * THE one contextual ask on Home. Renders directly under the layer it serves
 * (the verdict sits where the user acts), opens the Focus Ritual at that
 * altitude, and disappears entirely when the canon is fresh. Violet act-tone
 * per the house hero grammar. An empty OS rung is handled by the ladder's own
 * empty state, not here, so this only ever asks for the week or the day.
 */
export function CanonCta({ cta }: { cta: Cta | null }) {
  const h = useHaptics()
  if (!cta || cta.target === 'os') return null
  return (
    <button
      type="button"
      onClick={() => { h.select(); openFocusRitual(cta.target) }}
      className="w-full min-h-[44px] flex items-center justify-between gap-3 rounded-xl border border-violet-400/40 bg-violet-500/25 hover:bg-violet-500/35 px-4 py-2.5 text-left transition-colors"
    >
      <span className="text-ui font-semibold text-violet-50">{cta.label}</span>
      <ArrowRight size={15} className="text-violet-200/80 flex-shrink-0" />
    </button>
  )
}
