import React from 'react'
import { Sparkles } from '@/lib/icons'

interface Props {
  text?: string
  timestamp?: string
}

/** One-line synthesis — the "focus this week" headline from Marcus/Agatha. */
export function SynthesisLine({ text, timestamp }: Props) {
  if (!text) return null
  return (
    <div className="flex items-start gap-3 px-1 py-1">
      <Sparkles size={16} className="text-amber-300 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-ui text-white/80 leading-snug">{text}</p>
        {timestamp && (
          <p className="text-micro text-white/35 mt-1">{timestamp}</p>
        )}
      </div>
    </div>
  )
}
