import React from 'react'
import { Compass } from 'lucide-react'
import { useHaptics } from '../../hooks/useHaptics'

// The Home doorway into Focus & Purpose. A quiet row, not a widget: it shows
// no numbers, no state, no prompt, because the hub's whole doctrine is that
// nothing watches the operator from ambient chrome. One tap, one destination.

export function FocusEntryCard({
  variant = 'desktop', onNavigate,
}: {
  variant?: 'desktop' | 'mobile'
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}) {
  const h = useHaptics()
  const compact = variant === 'mobile'

  return (
    <button
      type="button"
      onPointerDown={() => h.tap()}
      onClick={() => onNavigate?.('focus')}
      className={`w-full rounded-2xl bg-white/[0.03] border border-white/[0.08] ${compact ? 'p-4' : 'p-5'}
                  flex items-center justify-between gap-4 text-left transition-all
                  hover:bg-white/[0.05] active:scale-[0.99] touch-manipulation`}
    >
      <span>
        <span className="block text-[14px] text-ink">Focus &amp; Purpose</span>
        <span className="block mt-0.5 text-[12px] text-ink-faint">
          One clean ask a day. Scripts for the conversations that matter.
        </span>
      </span>
      <Compass size={16} className="shrink-0 text-ink-faint" aria-hidden />
    </button>
  )
}
