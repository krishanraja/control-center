import React, { useMemo, useState } from 'react'
import { ChevronRight, Radar } from '@/lib/icons'
import { IconTile } from '../shared/IconTile'
import { rankSignals } from '../intel/SignalSheet'
import { SignalsDrawer } from './SignalsDrawer'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useHaptics } from '../../hooks/useHaptics'

const FRESH_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The door into the external head space — and nothing but a door. Market
 * intelligence never renders on Home itself (Krish's call: internal and
 * external must not share a surface), so this is doorway language only: a
 * tile, a word, a chevron, no signal text, no counts. It appears only when
 * Marcus's digest is fresh and carries a high or critical signal — its
 * arrival IS the message, the same conditional-presence contract as the
 * critical alert banner — and it opens the signals drawer, where the whole
 * condensed feed lives. A quiet week renders nothing at all.
 */
export function SignalsDoor() {
  const h = useHaptics()
  const { intel } = useHomeIntelligence()
  const [open, setOpen] = useState(false)

  const ranked = useMemo(() => rankSignals(intel.external_signals), [intel.external_signals])

  const fresh = intel.generated_at != null
    && Date.now() - Date.parse(intel.generated_at) < FRESH_MS
  const hot = ranked.some(s => s.urgency === 'critical' || s.urgency === 'high')

  if (!fresh || !hot) return null

  return (
    <>
      <button
        type="button"
        data-testid="signals-door"
        aria-haspopup="dialog"
        onClick={() => { h.select(); setOpen(true) }}
        className="group flex shrink-0 items-center gap-2 self-start rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.98]"
      >
        <IconTile icon={Radar} size="sm" />
        <span className="text-ui font-semibold leading-none text-white/90">Market signals</span>
        <ChevronRight size={14} className="text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
      </button>

      <SignalsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
