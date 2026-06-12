import { useMemo } from 'react'
import { Users, X, Sparkles } from 'lucide-react'
import { useRealtimeLeads, type LeadSourceType, type LeadRow } from '../../hooks/useRealtimeLeads'
import { useVentureRegistry, type VentureRow } from '../../hooks/useVentureRegistry'
import { LeadImportDropzone } from '../LeadImportDropzone'
import { SubstackImportDropzone } from '../SubstackImportDropzone'
import { LeadVentureLane } from './LeadVentureLane'
import { LeadCard } from '../LeadCard'
import { DecisionDetail } from '../DecisionDetail'
import { NextActionStrip } from '../shared/NextActionStrip'
import { BackburnerSection } from '../shared/BackburnerSection'
import { navigateDecision } from '../../lib/routeDecision'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

/**
 * Leads tab — venture-grouped lanes.
 *
 * Each lead carries primary_venture + tags + per-venture icp_scores. The
 * primary lane grouping is by venture (Mindmaker, Signal & Noise, Builder
 * Economy, ...) with an "Other" bucket for leads that did not clear any
 * venture's warm threshold yet. Source-type counts remain as a secondary
 * summary in the left rail so the import provenance is still legible.
 *
 * Enrichment is per-lead: every un-enriched lead surfaces an Enrich / Skip
 * pair on its card, so Apollo credits are only spent on leads Krish has
 * explicitly approved (replaces the prior global auto-enrich toggle).
 */
interface DesktopLeadsProps {
  onOpenLead?: (id: string) => void
  leadId?: string | null
  onClearDetail?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function DesktopLeads({ onOpenLead, leadId = null, onClearDetail, onNavigate }: DesktopLeadsProps = {}) {
  const { leads: allLeads, loading } = useRealtimeLeads({
    statusIn: ['new', 'enriching', 'ready', 'contacted', 'conversation'],
  })
  const { ventures } = useVentureRegistry()
  const leads = useMemo(() => allLeads.filter(l => !l.buried_at), [allLeads])
  const buriedLeads = useMemo(() => allLeads.filter(l => l.buried_at), [allLeads])

  const byVenture = useMemo(() => groupByVenture(leads), [leads])
  const bySource = useMemo(() => groupBySource(leads), [leads])

  const totalActive = leads.length

  // Surface the highest-priority un-enriched lead so the CEO can decide once
  // per visit. "Candidates" are status='new' (no enrichment cost spent yet);
  // rank by ICP score (max across ventures) so the best one bubbles up.
  const candidates = useMemo(() => {
    return leads
      .filter(l => l.status === 'new' && !l.deep_enriched_at)
      .map(l => {
        const scores = l.icp_scores ? Object.values(l.icp_scores).map(Number).filter(Number.isFinite) : []
        const maxIcp = scores.length > 0 ? Math.max(...scores) : (l.icp_score ?? 0)
        return { lead: l, maxIcp }
      })
      .sort((a, b) => b.maxIcp - a.maxIcp)
  }, [leads])
  const topCandidate = candidates[0]?.lead || null
  const candidateInsight = topCandidate
    ? `${candidates.length} un-enriched · top fit: ${topCandidate.full_name || topCandidate.company || 'unnamed'}${topCandidate.primary_venture ? ` (${topCandidate.primary_venture.replace(/_/g, ' ')})` : ''}`
    : 'No candidates waiting — credits only spent on explicit Enrich.'

  const handleOpen = onOpenLead || ((id: string) => navigateDecision(onNavigate || (() => {}), 'lead', id))

  // Focus Mode (Phase 3): when enabled and today is calibrated, the venture
  // lanes regroup into the 3 daily-target lanes via relevance_index (table
  // 'leads'). The visible set is every active lead the tab already lists, fed
  // through one uniform renderer that reuses LeadCard so select/open behavior
  // is identical to the normal view.
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderLeadRow = (lead: LeadRow) => <LeadCard lead={lead} onOpen={handleOpen} />

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <Users size={20} className="text-emerald-300" />
            Pipeline
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            Grouped by venture. One lead can surface in multiple lanes when it qualifies for more than one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFocusModeEnabled() && calibrated && (
            <FocusModeToggle mode={mode} onChange={setMode} />
          )}
          <span className="text-[11px] text-white/55 tabular-nums">
            {loading ? '…' : `${totalActive} active`}
          </span>
        </div>
      </header>

      <NextActionStrip
        headline={candidates.length}
        headlineLabel="to decide"
        insight={candidateInsight}
        ctaLabel="Open next"
        onCta={() => topCandidate && handleOpen(topCandidate.id)}
        icon={Sparkles}
        accent="text-emerald-300"
        disabled={!topCandidate}
      />

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

      <div className="grid grid-cols-1 lg:[grid-template-columns:minmax(0,1fr)_minmax(0,2fr)] gap-5">
        <aside className="space-y-4 min-w-0">
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              Import
            </h2>
            <LeadImportDropzone />
            <div className="mt-3">
              <SubstackImportDropzone />
            </div>
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

        <div className="space-y-3 min-w-0">
          {showFocus ? (
            <FocusLanes
              rows={leads}
              table="leads"
              keyOf={l => String(l.id)}
              renderItem={renderLeadRow}
              fallback={null}
              mutedLabel="Off focus"
            />
          ) : (
            <>
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
            </>
          )}
          <BackburnerSection
            table="leads"
            items={buriedLeads.map(l => ({
              id: l.id,
              title: [l.full_name, l.company].filter(Boolean).join(' · ') || '(unnamed)',
              buried_reason: l.buried_reason,
            }))}
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
  audience: { title: 'Audience', description: 'Inbound signups from CTRL, the site, Substack, and Builder Economy.' },
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
