import React from 'react'
import { statusStyle } from '../shared/tokens'

export interface HealthItem {
  id: string
  label: string
  status: string
}

interface Props {
  items: HealthItem[]
  title?: string
}

/** Horizontal-scroll chips summarising system/engine health. */
export function HealthStrip({ items, title = 'Systems' }: Props) {
  if (!items.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 px-1">
        {title}
      </p>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
        {items.map(item => {
          const s = statusStyle(item.status)
          return (
            <span
              key={item.id}
              className={`flex-shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-2 border border-white/[0.06] ${s.bg}`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-[13px] font-medium text-white/85 whitespace-nowrap">
                {item.label}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
