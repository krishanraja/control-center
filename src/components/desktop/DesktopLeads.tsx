import React, { useMemo } from 'react'
import { Users } from 'lucide-react'
import { useRealtimeLeads, type LeadSourceType, type LeadRow } from '../../hooks/useRealtimeLeads'
import { LeadImportDropzone } from '../LeadImportDropzone'
import { LeadSourceLane } from './LeadSourceLane'

/**
 * Leads tab — source-grouped lanes.
 *
 * The user complaint that drove this: "leads should really be pulling in all
 * the... I have tons of documents of leads that need to go in here". Today
 * leads are scattered across the Home pipeline lane (3 cards) and the Plans
 * tab filter view. This tab is the canonical surface.
 *
 * Layout:
 *   • Left rail (1fr): drag-and-drop ingest + summary chips
 *   • Right pane (2fr): lanes grouped by source_type
 */
export function DesktopLeads({ onOpenLead }: { onOpenLead?: (id: string) => void } = {}) {
  const { leads, loading } = useRealtimeLeads({
    // Active workflow only — closed_won/closed_lost/superseded archived from default view.
    statusIn: ['new', 'enriching', 'ready', 'contacted', 'conversation'],
  })

  const bySource = useMemo(() => groupBySource(leads), [leads])

  const totalActive = leads.length

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <Users size={20} className="text-emerald-300" />
            Leads
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            Every lead, with the source it came from. Drop a doc, paste a Drive link,
            pull a podcast audience — they all land here.
          </p>
        </div>
        <span className="text-[11px] text-white/55 tabular-nums">
          {loading ? '…' : `${totalActive} active`}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_2fr] gap-5">
        {/* Left rail — ingest + summary */}
        <aside className="space-y-4">
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              Import
            </h2>
            <LeadImportDropzone />
          </section>

          <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              By source
            </h2>
            <ul className="space-y-1">
              {(Object.keys(SOURCE_META) as LeadSourceType[]).map(src => {
                const count = (bySource[src] || []).length
                const meta = SOURCE_META[src]
                return (
                  <li
                    key={src}
                    className="flex items-center justify-between gap-2 py-1 text-[12px]"
                  >
                    <span className="text-white/75 truncate">{meta.title}</span>
                    <span className={`tabular-nums ${count > 0 ? 'text-white/85' : 'text-white/25'}`}>
                      {count}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>

        {/* Right pane — lanes */}
        <div className="space-y-3">
          {(Object.keys(SOURCE_META) as LeadSourceType[]).map(src => (
            <LeadSourceLane
              key={src}
              sourceType={src}
              title={SOURCE_META[src].title}
              description={SOURCE_META[src].description}
              leads={bySource[src] || []}
              onOpen={onOpenLead}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const SOURCE_META: Record<LeadSourceType, { title: string; description: string }> = {
  podcast_audience: {
    title: 'Podcast audiences',
    description: "From episodes you've appeared on — Signal & Noise, Builder Economy.",
  },
  drive_import: {
    title: 'Document imports',
    description: 'CSV / PDF / DOCX dropped into the ingest zone.',
  },
  apollo: {
    title: 'Apollo / outbound',
    description: 'Enriched contacts from Apollo + Instantly sequences.',
  },
  nell_candidate: {
    title: 'Nell candidates',
    description: 'Auto-surfaced contacts from Nell\'s daily scout.',
  },
  signal_inbox: {
    title: 'Signal Inbox',
    description: 'Drive Signal Inbox folder, processed by Layer 1.',
  },
  manual: {
    title: 'Manual',
    description: "Anything you added by hand.",
  },
}

function groupBySource(leads: LeadRow[]): Partial<Record<LeadSourceType, LeadRow[]>> {
  const out: Partial<Record<LeadSourceType, LeadRow[]>> = {}
  for (const l of leads) {
    const arr = out[l.source_type] || (out[l.source_type] = [])
    arr.push(l)
  }
  return out
}
