import React, { useMemo } from 'react'
import { Users, X } from 'lucide-react'
import { useRealtimeLeads, type LeadSourceType, type LeadRow } from '../../hooks/useRealtimeLeads'
import { useVentureRegistry, type VentureRow } from '../../hooks/useVentureRegistry'
import { LeadImportDropzone } from '../LeadImportDropzone'
import { LeadVentureLane } from './LeadVentureLane'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'

/**
 * Leads tab — venture-grouped lanes (PR 5).
 *
 * After PR 5 each lead carries primary_venture + tags + per-venture icp_scores.
 * The primary lane grouping is therefore by venture (Mindmaker, Signal & Noise,
 * Builder Economy, ...) with an "Other" bucket for leads that did not clear any
 * venture's warm threshold yet. Source-type counts remain as a secondary
 * summary in the left rail so the import provenance is still legible.
 */
interface DesktopLeadsProps {
  onOpenLead?: (id: string) => void
  leadId?: string | null
  onClearDetail?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function DesktopLeads({ onOpenLead, leadId = null, onClearDetail, onNavigate }: DesktopLeadsProps = {}) {
  const { leads, loading } = useRealtimeLeads({
    statusIn: ['new', 'enriching', 'ready', 'contacted', 'conversation'],
  })
  const { ventures } = useVentureRegistry()

  const byVenture = useMemo(() => groupByVenture(leads), [leads])
  const bySource = useMemo(() => groupBySource(leads), [leads])

  const totalActive = leads.length

  const handleOpen = onOpenLead || ((id: string) => navigateDecision(onNavigate || (() => {}), 'lead', id))

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <Users size={20} className="text-emerald-300" />
            Leads
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            Grouped by venture. One lead can surface in multiple lanes when it qualifies for more than one.
          </p>
        </div>
        <span className="text-[11px] text-white/55 tabular-nums">
          {loading ? '…' : `${totalActive} active`}
        </span>
      </header>

      {leadId && (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
            <span className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/85">Detail</span>
            <button
              type="button"
              onClick={() => onClearDetail?.()}
              className="text-white/50 hover:text-white/85 inline-flex items-center gap-1 text-[12px]"
              aria-label="Close detail"
            >
              <X size={14} /> Close
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <DecisionDetail decision={`lead:${leadId}`} onClose={onClearDetail} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_2fr] gap-5">
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

        <div className="space-y-3">
          {ventures.map(v => (
            <LeadVentureLane
              key={v.slug}
              venture={v}
              leads={byVenture[v.slug] || []}
              onOpen={handleOpen}
            />
          ))}
          <LeadVentureLane
            venture={null}
            fallbackTitle="Other"
            leads={byVenture.__other || []}
            onOpen={handleOpen}
          />
        </div>
      </div>
    </div>
  )
}

const SOURCE_META: Record<LeadSourceType, { title: string; description: string }> = {
  podcast_audience: { title: 'Podcast audiences', description: "From episodes you've appeared on." },
  drive_import: { title: 'Document imports', description: 'CSV / PDF / DOCX dropped into the ingest zone.' },
  apollo: { title: 'Apollo / outbound', description: 'Enriched contacts from Apollo + Instantly sequences.' },
  nell_candidate: { title: 'Nell candidates', description: 'Auto-surfaced contacts from Nell\'s daily scout.' },
  signal_inbox: { title: 'Signal Inbox', description: 'Drive Signal Inbox folder, processed by Layer 1.' },
  manual: { title: 'Manual', description: 'Anything you added by hand.' },
}

function groupBySource(leads: LeadRow[]): Partial<Record<LeadSourceType, LeadRow[]>> {
  const out: Partial<Record<LeadSourceType, LeadRow[]>> = {}
  for (const l of leads) {
    const arr = out[l.source_type] || (out[l.source_type] = [])
    arr.push(l)
  }
  return out
}

function groupByVenture(leads: LeadRow[]): Record<string, LeadRow[]> {
  const out: Record<string, LeadRow[]> = {}
  for (const l of leads) {
    const key = l.primary_venture || '__other'
    const arr = out[key] || (out[key] = [])
    arr.push(l)
  }
  return out
}
