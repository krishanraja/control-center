import React from 'react'
import { Sparkles } from 'lucide-react'

interface Props {
  text?: string
  timestamp?: string
}

/** One-line synthesis — the "focus this week" headline from Marcus/Agatha. */
export function SynthesisLine({ text, timestamp }: Props) {
  if (!text) return null
  return (
    <div className="flex items-start gap-3 px-1 py-1">
      <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
      <div className="min-w-0">
        <p className="text-[15px] text-white/80 leading-snug">{text}</p>
        {timestamp && (
          <p className="text-[11px] text-white/35 mt-1">{timestamp}</p>
        )}
      </div>
    </div>
  )
}
