import React, { useEffect, useMemo, useState } from 'react'
import { Users, Linkedin, Mail, ExternalLink, X, ThumbsUp } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState } from './primitives'
import { DetailSheet } from './DetailSheet'
import { LeadImportDropzone } from '../LeadImportDropzone'
import { useRealtimeLeads, type LeadRow, type LeadSourceType, type LeadStatus } from '../../hooks/useRealtimeLeads'
import { useVentureRegistry } from '../../hooks/useVentureRegistry'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { humanAge } from '../../lib/ageHelpers'
import { navigateDecision } from '../../lib/routeDecision'

const SOURCE_TITLE: Record<LeadSourceType, string> = {
  podcast_audience: 'Podcast audiences',
  drive_import:     'Document imports',
  apollo:           'Apollo / outbound',
  nell_candidate:   'Nell candidates',
  signal_inbox:     'Signal Inbox',
  manual:           'Manual',
}

function fitDot(fit?: number | null): string {
  if (fit == null) return 'bg-white/30'
  if (fit >= 8) return 'bg-emerald-400'
  if (fit >= 6) return 'bg-amber-400'
  return 'bg-white/30'
}

function leadName(l: LeadRow): string {
  return l.full_name || (l.email ? l.email.split('@')[0] : 'Unnamed')
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

  const setStatus = async (id: string, next: LeadStatus) => {
    h.heavy()
    try {
      const r = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const labels: Partial<Record<LeadStatus, string>> = {
        contacted: 'Marked contacted.',
        superseded: 'Dropped.',
        ready: 'Marked ready.',
      }
      h.success()
      toast(labels[next] || 'Updated.', 'success')
      closeDetail()
    } catch {
      h.error()
      toast('Could not update lead — try again.', 'error')
    }
  }

  const openLead = openId ? leads.find(l => l.id === openId) ?? null : null

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Leads"
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

      {total === 0 && !loading && (
        <EmptyState label="No active leads. Tap Import to drop a Google Drive file." />
      )}

      {[
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
              />
            ))}
            {rows.length > 8 && (
              <div className="px-7 py-4 text-[14px] text-white/35 text-center">
                +{rows.length - 8} more
              </div>
            )}
          </FeedCard>
        )
      })}

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
        actions={openLead ? buildActions(openLead, setStatus, h) : []}
      />
    </MobileShellPrim>
  )
}

function buildActions(
  l: LeadRow,
  setStatus: (id: string, next: LeadStatus) => Promise<void>,
  h: ReturnType<typeof useHaptics>,
) {
  const acts: { label: string; variant?: 'primary' | 'secondary' | 'danger'; onClick: () => void }[] = []

  if (l.status !== 'contacted' && l.status !== 'conversation') {
    acts.push({
      label: 'Mark contacted',
      variant: 'primary',
      onClick: () => setStatus(l.id, 'contacted'),
    })
  }
  if (l.linkedin_url) {
    acts.push({
      label: 'Open LinkedIn',
      variant: 'secondary',
      onClick: () => { h.tap(); window.open(l.linkedin_url!, '_blank', 'noreferrer,noopener') },
    })
  }
  if (l.email) {
    acts.push({
      label: 'Email',
      variant: 'secondary',
      onClick: () => { h.tap(); window.location.href = `mailto:${l.email}` },
    })
  }
  acts.push({
    label: 'Drop',
    variant: 'danger',
    onClick: () => setStatus(l.id, 'superseded'),
  })
  return acts
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
