import React, { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'

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
      <div className="flex flex-col gap-3">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-[12px] text-white/50 hover:text-white self-start">
            <ChevronLeft size={14} /> Back
          </button>
        )}
        {right}
      </div>
    ) : <>{left}</>
  }

  return (
    <div className="flex gap-4 min-h-[calc(100vh-4rem)]">
      <div style={{ width: leftWidth }} className="flex-shrink-0 overflow-y-auto">{left}</div>
      <div className="flex-1 min-w-0 overflow-y-auto border-l border-white/[0.06] pl-4">{right}</div>
    </div>
  )
}
