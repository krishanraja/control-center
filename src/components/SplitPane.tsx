import React, { useState, useEffect } from 'react'
import { ChevronLeft } from '@/lib/icons'

interface Props {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: string
  hasSelection?: boolean
  onBack?: () => void
}

export function SplitPane({ left, right, leftWidth = '35%', hasSelection, onBack }: Props) {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1200)
    on(); window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  if (narrow) {
    return hasSelection ? (
      <div className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-label text-ink-faint hover:text-ink self-start">
            <ChevronLeft size={14} /> Back
          </button>
        )}
        {right}
      </div>
    ) : <div className="h-full min-h-0 overflow-y-auto">{left}</div>
  }

  // `h-full`, not `min-h-[calc(100vh-4rem)]`. A MIN height means the pane can
  // only ever be taller than the screen, never shorter — so its two columns
  // never bounded their own scroll and the page grew instead. The 4rem was a
  // guess at the chrome above it, and wrong wherever that chrome changed.
  return (
    <div className="flex gap-4 h-full min-h-0">
      <div style={{ width: leftWidth }} className="flex-shrink-0 overflow-y-auto min-h-0">{left}</div>
      <div className="flex-1 min-w-0 overflow-y-auto min-h-0 border-l border-white/[0.06] pl-4">{right}</div>
    </div>
  )
}
