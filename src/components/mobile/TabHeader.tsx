import React from 'react'

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
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leading}
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold text-white leading-[1.1] tracking-tight truncate">
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
