import React from 'react'
import { Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function LastUpdated({ date }: { date: Date | null }) {
  if (!date) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/25 font-mono">
      <Clock size={10} />
      Updated {formatDistanceToNow(date, { addSuffix: true })}
    </span>
  )
}
