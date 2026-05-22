import React from 'react'
import { ChevronRight } from 'lucide-react'
import { LeadCard } from '../LeadCard'
import type { LeadRow } from '../../hooks/useRealtimeLeads'
import type { VentureRow } from '../../hooks/useVentureRegistry'

interface Props {
  venture: VentureRow | null
  fallbackTitle?: string
  description?: string
  leads: LeadRow[]
  onOpen?: (id: string) => void
}

/**
 * One lane per `primary_venture` on the Leads tab. Mirrors LeadSourceLane but
 * groups by venture, surfacing the per-venture icp_scores breakdown on each
 * card. Empty lanes still render so Krish can see at a glance which ventures
 * have no qualified leads this week.
 */
export function LeadVentureLane({ venture, fallbackTitle, description, leads, onOpen }: Props) {
  const [collapsed, setCollapsed] = React.useState(false)
  const title = venture?.display_name || fallbackTitle || 'Other'
  const desc = description ?? venture?.icp_description ?? 'Unclassified or below warm threshold for every venture.'

  if (leads.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
        <header className="flex items-baseline justify-between mb-1">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{title}</h3>
          <span className="text-[10px] text-white/30 tabular-nums">0</span>
        </header>
        <p className="text-[11px] text-white/35 line-clamp-2">{desc}</p>
      </section>
    )
  }

  const top = collapsed ? [] : leads.slice(0, 6)
  const remaining = leads.length - top.length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={12}
          className={`text-white/40 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75 truncate">
            {title}
          </h3>
          <p className="text-[11px] text-white/45 truncate">{desc}</p>
        </div>
        <span className="text-[11px] tabular-nums text-white/55 flex-shrink-0">
          {leads.length}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-white/[0.05] p-3 space-y-2">
          {top.map(l => (
            <LeadCard key={l.id} lead={l} onOpen={onOpen} />
          ))}
          {remaining > 0 && (
            <div className="text-[11px] text-white/40 text-center py-1">
              +{remaining} more
            </div>
          )}
        </div>
      )}
    </section>
  )
}
