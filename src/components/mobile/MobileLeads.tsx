import React, { useEffect, useMemo, useState } from 'react'
import { Users, Linkedin, Mail, ExternalLink, X, ThumbsUp, Sparkles, Layers, ChevronRight } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState } from './primitives'
import { MobileShell as MobileStage } from './MobileShell'
import { DetailSheet } from './DetailSheet'
import { LeadImportDropzone } from '../LeadImportDropzone'
import { useRealtimeLeads, type LeadRow, type LeadSourceType } from '../../hooks/useRealtimeLeads'
import { isTestRecord } from '../../lib/recordHygiene'
import { NextLeadHero } from '../leads/NextLeadHero'
import { useVentureRegistry } from '../../hooks/useVentureRegistry'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { humanAge } from '../../lib/ageHelpers'
import { navigateDecision } from '../../lib/routeDecision'
import { buildDecisionActions } from '../../lib/decisionActions'
import { SwipeDeck } from '../shared/SwipeDeck'
import { useSwipeTriage } from '../../hooks/useSwipeTriage'
import { reasonsFor } from '../../lib/triageReasons'
import { buildLeadsTriageConfig } from '../../lib/triageConfig'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

const SOURCE_TITLE: Record<LeadSourceType, string> = {
  podcast_audience: 'Podcast audiences',
  drive_import:     'Document imports',
  apollo:           'Apollo / outbound',
  nell_candidate:   'Nell candidates',
  signal_inbox:     'Signal Inbox',
  audience:         'Audience',
  manual:           'Manual',
}

function fitDot(fit?: number | null): string {
  if (fit == null) return 'bg-white/30'
  if (fit >= 8) return 'bg-emerald-400'
  if (fit >= 6) return 'bg-amber-400'
  return 'bg-white/30'
}

function leadName(l: LeadRow): string {
  return l.full_name || l.company || (l.email ? l.email.split('@')[0] : 'New lead')
}

function leadSubtitle(l: LeadRow): string {
  return [l.title, l.company].filter(Boolean).join(' · ')
}

interface MobileLeadsProps {
  leadId?: string | null
  onClearDetail?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function MobileLeads({ leadId = null, onClearDetail, onNavigate }: MobileLeadsProps = {}) {
  const h = useHaptics()
  const { toast } = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  const { leads, loading } = useRealtimeLeads({
    statusIn: ['new', 'enriching', 'ready', 'contacted', 'conversation'],
    filter: l => !l.buried_at && !isTestRecord(l),
  })
  const { ventures } = useVentureRegistry()

  useEffect(() => {
    setOpenId(leadId || null)
  }, [leadId])

  const openLeadFromRow = (id: string) => {
    h.select()
    if (onNavigate) navigateDecision(onNavigate, 'lead', id)
    else setOpenId(id)
  }

  const closeDetail = () => {
    setOpenId(null)
    onClearDetail?.()
  }

  const groupedByVenture = useMemo(() => {
    const out: Record<string, LeadRow[]> = {}
    for (const l of leads) {
      const key = l.primary_venture || '__other'
      const arr = out[key] || (out[key] = [])
      arr.push(l)
    }
    return out
  }, [leads])

  const ventureCount = Object.keys(groupedByVenture).filter(k => (groupedByVenture[k] || []).length > 0).length

  const featured = useMemo(() => pickFeatured(leads), [leads])

  const total = leads.length
  const newToday = leads.filter(l => {
    if (!l.created_at) return false
    const ageMs = Date.now() - new Date(l.created_at).getTime()
    return ageMs < 24 * 60 * 60 * 1000
  }).length
  const contacted = leads.filter(l => l.status === 'contacted' || l.status === 'conversation').length

  const openLead = openId ? leads.find(l => l.id === openId) ?? null : null

  // Mirrors DesktopLeads: surface un-enriched candidates so the CEO can
  // decide per-lead whether to spend Apollo credits. Top candidate is the
  // one with the highest ICP score across ventures.
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
    ? `Top fit: ${topCandidate.full_name || topCandidate.company || 'unnamed'}${topCandidate.primary_venture ? ` (${topCandidate.primary_venture.replace(/_/g, ' ')})` : ''}`
    : 'No candidates waiting — credits only spent on explicit Enrich.'

  // Swipe-triage over the decision queue (status new/ready). RIGHT is
  // context-aware (Enrich a raw candidate, Promote a ready lead), LEFT drops
  // with the shared `leads` reason chips — identical grammar to Network.
  const triageConfig = useMemo(() => buildLeadsTriageConfig(leads, { toast }, loading), [leads, toast, loading])
  const triage = useSwipeTriage<LeadRow>({
    items: triageConfig.items,
    getId: triageConfig.getId,
    loading,
    onAccept: triageConfig.onAccept,
    onReject: triageConfig.onReject,
  })

  const detailSheet = (
    <DetailSheet
      open={openLead != null}
      onClose={closeDetail}
      eyebrow={openLead ? SOURCE_TITLE[openLead.source_type] : undefined}
      title={openLead ? leadName(openLead) : ''}
      body={openLead?.why_relevant || openLead?.primary_tension || leadSubtitle(openLead || ({} as LeadRow))}
      agent={openLead?.assignee_agent || 'nell'}
      status={openLead?.status}
      meta={openLead?.fit_score != null ? `Fit ${openLead.fit_score}/10` : undefined}
      docUrl={openLead?.source_url || undefined}
      actions={openLead ? buildDecisionActions('lead', openLead, { toast, haptics: h, onDone: closeDetail }) : []}
    />
  )

  // Focus Mode (Phase 3): when enabled and today is calibrated, the venture
  // feed cards regroup into the 3 daily-target lanes via relevance_index (table
  // 'leads'). The visible set is every active lead the tab already lists, fed
  // through one uniform FeedRow renderer that preserves the existing tap-to-open
  // and feedback behavior.
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderLeadRow = (l: LeadRow) => (
    <FeedRow
      dotColor={fitDot(l.fit_score)}
      title={leadName(l)}
      detail={l.why_relevant || leadSubtitle(l) || undefined}
      trailing={<span className="text-[14px] text-white/35 tabular-nums">{humanAge(l.updated_at)}</span>}
      onClick={() => openLeadFromRow(l.id)}
      feedback={{ sourceTable: 'leads', sourceId: l.id, agentId: l.assignee_agent }}
    />
  )

  if (triage.mode === 'deck') {
    return (
      <MobileStage scroll="none" header={<TabHeader title="Pipeline" subtitle={`${triageConfig.items.length} to triage · swipe to decide`} />}>
        <div className="flex-1 min-h-0 px-1">
          <SwipeDeck<LeadRow>
            deck={triage.deck}
            getId={triageConfig.getId}
            renderBody={triageConfig.renderBody}
            ariaLabel={triageConfig.ariaLabel}
            onAccept={triage.accept}
            onReject={triage.reject}
            onOpen={l => openLeadFromRow(l.id)}
            leftLabel={triageConfig.leftLabel}
            rightLabel={triageConfig.rightLabel}
            rightIntent={triageConfig.rightIntent}
            pending={triage.pending}
            reasonChips={() => reasonsFor(triageConfig.reasonsTable)}
            onChooseReason={triage.chooseReason}
            onCancelPending={triage.cancelPending}
            remaining={triage.remaining}
            triagedCount={triage.triagedCount}
            onExit={triage.exitDeck}
            title={triageConfig.title}
            paused={openLead != null}
            narrow
          />
        </div>
        {detailSheet}
      </MobileStage>
    )
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Pipeline"
          subtitle={loading ? 'Loading…' : `${total} active across ${ventureCount} ventures`}
          trailing={
            <button
              onClick={() => { h.tap(); setShowImport(s => !s) }}
              className="px-5 py-3 rounded-full bg-white text-black text-[15px] font-semibold active:scale-95 transition-transform"
            >
              Import
            </button>
          }
        />
      }
    >
      <NextLeadHero leads={leads} narrow />

      {showImport && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex-shrink-0">
          <LeadImportDropzone />
        </div>
      )}

      {featured && (
        <HeroCard
          eyebrow={`Top fit · ${SOURCE_TITLE[featured.source_type]}`}
          dotColor={fitDot(featured.fit_score)}
          accent={featured.fit_score && featured.fit_score >= 8 ? 'emerald' : 'violet'}
          title={leadName(featured)}
          detail={featured.why_relevant || leadSubtitle(featured) || 'No context yet — open to enrich.'}
          meta={featured.fit_score != null ? `Fit ${featured.fit_score}/10 · ${humanAge(featured.updated_at) || 'just now'}` : humanAge(featured.updated_at)}
          cta="Open"
          onClick={() => openLeadFromRow(featured.id)}
        />
      )}

      <div className="flex gap-3 flex-shrink-0">
        <StatPill label="Active" value={total} color="text-white" />
        <StatPill label="Contacted" value={contacted} color={contacted > 0 ? 'text-emerald-300' : 'text-white/45'} />
        <StatPill label="New 24h" value={newToday} color={newToday > 0 ? 'text-amber-300' : 'text-white/45'} />
      </div>

      {/* Swipe-triage entry for the decision queue */}
      {triageConfig.items.length > 0 && (
        <button
          type="button"
          onClick={() => { h.tap(); triage.forceDeck() }}
          className="w-full flex items-center gap-2.5 rounded-2xl border border-violet-400/30 bg-violet-500/10 active:bg-violet-500/20 p-3.5 text-left transition-colors flex-shrink-0"
        >
          <Layers size={18} className="text-violet-300 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-violet-100">Swipe to triage · {triageConfig.items.length}</p>
            <p className="text-[11px] text-white/45">One card at a time — right enriches or promotes, left drops with a reason.</p>
          </div>
          <ChevronRight size={16} className="text-violet-300/70 ml-auto flex-shrink-0" />
        </button>
      )}

      {isFocusModeEnabled() && calibrated && (
        <div className="flex items-center justify-end -mt-1">
          <FocusModeToggle mode={mode} onChange={setMode} />
        </div>
      )}

      {total === 0 && !loading && (
        <EmptyState label="No active leads. Tap Import to drop a Google Drive file." />
      )}

      {showFocus ? (
        <FeedCard title="Pipeline, by focus">
          <FocusLanes
            rows={leads}
            table="leads"
            keyOf={l => String(l.id)}
            renderItem={renderLeadRow}
            fallback={null}
            mutedLabel="Off focus"
          />
        </FeedCard>
      ) : (
        [
          ...ventures.map(v => ({ slug: v.slug, title: v.display_name })),
          { slug: '__other', title: 'Other' },
        ].map(({ slug, title }) => {
          const rows = groupedByVenture[slug] || []
          if (rows.length === 0) return null
          return (
            <FeedCard
              key={slug}
              title={`${title} · ${rows.length}`}
            >
              {rows.slice(0, 8).map(l => (
                <FeedRow
                  key={l.id}
                  dotColor={fitDot(l.fit_score)}
                  title={leadName(l)}
                  detail={l.why_relevant || leadSubtitle(l) || undefined}
                  trailing={
                    <span className="text-[14px] text-white/35 tabular-nums">{humanAge(l.updated_at)}</span>
                  }
                  onClick={() => openLeadFromRow(l.id)}
                  feedback={{ sourceTable: "leads", sourceId: l.id, agentId: l.assignee_agent }}
                />
              ))}
              {rows.length > 8 && (
                <div className="px-7 py-4 text-[14px] text-white/35 text-center">
                  +{rows.length - 8} more
                </div>
              )}
            </FeedCard>
          )
        })
      )}

      {detailSheet}
    </MobileShellPrim>
  )
}

function pickFeatured(leads: LeadRow[]): LeadRow | null {
  if (leads.length === 0) return null
  // Highest fit_score among 'ready' or 'new' leads; falls back to most recent.
  const candidates = leads.filter(l => l.status === 'ready' || l.status === 'new')
  const pool = candidates.length > 0 ? candidates : leads
  return [...pool].sort((a, b) => {
    const fa = a.fit_score ?? -1
    const fb = b.fit_score ?? -1
    if (fb !== fa) return fb - fa
    const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return ub - ua
  })[0]
}
