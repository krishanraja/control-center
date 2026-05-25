import React from 'react'
import { Logomark } from './Logomark'

interface Props {
  title: string
  subtitle?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

/**
 * Mobile tab header — iOS Large Title feel. Leading slot for logomark/avatar,
 * trailing slot for action buttons (More, filter, etc.).
 */
export function TabHeader({ title, subtitle, leading, trailing }: Props) {
  const resolvedLeading = leading === undefined ? <Logomark size={32} /> : leading
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {resolvedLeading}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-white leading-[1.1] tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] text-white/55 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </header>
  )
}
