import React, { useState, useEffect } from 'react'
import { ChevronLeft } from '@/lib/icons'
import { CAPTURE_PILLS_PAD } from './shared/AppFrame'

interface Props {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: string
  hasSelection?: boolean
  onBack?: () => void
  /** Reserve the ⌘I / ⌘/ pill gutter inside each column's own scroll (both
   *  reach the bottom of the frame), the way AppFrame `capturePills` does for
   *  a single body. */
  capturePills?: boolean
  /** `<prefix>-left` / `<prefix>-right` on the two scrollers, for a spec. */
  testIdPrefix?: string
}

export function SplitPane({ left, right, leftWidth = '35%', hasSelection, onBack, capturePills, testIdPrefix }: Props) {
  const pills = capturePills ? CAPTURE_PILLS_PAD : ''
  const tid = (side: string) => (testIdPrefix ? `${testIdPrefix}-${side}` : undefined)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1200)
    on(); window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  if (narrow) {
    return hasSelection ? (
      <div data-testid={tid('right')} className={`flex flex-col gap-3 h-full min-h-0 overflow-y-auto ${pills}`}>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-label text-ink-faint hover:text-ink self-start">
            <ChevronLeft size={14} /> Back
          </button>
        )}
        {right}
      </div>
    ) : <div data-testid={tid('left')} className={`h-full min-h-0 overflow-y-auto ${pills}`}>{left}</div>
  }

  // `h-full`, not `min-h-[calc(100vh-4rem)]`. A MIN height means the pane can
  // only ever be taller than the screen, never shorter — so its two columns
  // never bounded their own scroll and the page grew instead. The 4rem was a
  // guess at the chrome above it, and wrong wherever that chrome changed.
  return (
    <div className="flex gap-4 h-full min-h-0">
      <div data-testid={tid('left')} style={{ width: leftWidth }} className={`flex-shrink-0 overflow-y-auto min-h-0 ${pills}`}>{left}</div>
      <div data-testid={tid('right')} className={`flex-1 min-w-0 overflow-y-auto min-h-0 border-l border-white/[0.06] pl-4 ${pills}`}>{right}</div>
    </div>
  )
}
