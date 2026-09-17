import React from 'react'
import { ChevronRight } from '@/lib/icons'
import { GuestCard } from '../GuestCard'
import type { GuestRow, GuestStatus } from '../../hooks/useRealtimeGuests'

interface Props {
  status: GuestStatus
  title: string
  description: string
  guests: GuestRow[]
  onOpen?: (id: string) => void
}

export function GuestStatusLane({ status, title, description, guests, onOpen }: Props) {
  const [collapsed, setCollapsed] = React.useState(status === 'dropped')

  if (guests.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
        <header className="flex items-baseline justify-between mb-1">
          <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-ink-faint">{title}</h3>
          <span className="text-micro text-ink-faint tabular-nums">0</span>
        </header>
        <p className="text-micro text-ink-faint">{description}</p>
      </section>
    )
  }

  const top = collapsed ? [] : guests.slice(0, 6)
  const remaining = guests.length - top.length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]" data-status={status}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={12}
          className={`text-ink-faint transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-ink-muted truncate">
            {title}
          </h3>
          <p className="text-micro text-ink-faint truncate">{description}</p>
        </div>
        <span className="text-micro tabular-nums text-ink-faint flex-shrink-0">{guests.length}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-white/[0.05] p-3 space-y-2">
          {top.map(g => (
            <GuestCard key={g.id} guest={g} onOpen={onOpen} />
          ))}
          {remaining > 0 && (
            <div className="text-micro text-ink-faint text-center py-1">+{remaining} more</div>
          )}
        </div>
      )}
    </section>
  )
}
