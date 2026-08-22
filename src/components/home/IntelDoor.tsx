import React from 'react'
import { ChevronRight, Radar } from '@/lib/icons'
import { IconTile } from '../shared/IconTile'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * Home's door into the daily intel drawer. Same doorway language as
 * FocusDoor's pill — a tile, a word, a chevron, never a number (an unread
 * count here would put a demand on the operator's attention, which ambient
 * chrome must not do).
 */
export function IntelDoor({ onOpen }: { onOpen: () => void }) {
  const h = useHaptics()
  return (
    <button
      type="button"
      data-testid="intel-door"
      aria-haspopup="dialog"
      onClick={() => { h.select(); onOpen() }}
      className="group flex shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.98]"
    >
      <IconTile icon={Radar} size="sm" />
      <span className="text-ui font-semibold leading-none text-white/90">Intel</span>
      <ChevronRight size={14} className="text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
    </button>
  )
}
