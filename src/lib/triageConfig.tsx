import React from 'react'
import { Target, Sparkles, Flame } from 'lucide-react'
import type { CommitResult } from '../hooks/useSwipeTriage'
import type { CardLabel, RightIntent } from '../components/shared/SwipeDeck'
import type { DecisionKind } from '../components/DecisionDetail'
import type { LeadRow } from '../hooks/useRealtimeLeads'
import { triageReject } from './triageActions'

/**
 * triageConfig — one place that describes how each surface drives the shared
 * triage deck (mobile SwipeDeck) and the desktop SwipeCockpit. A config carries
 * the data + the gesture handlers + the card body, so both shells render the
 * SAME logic and only differ in layout. The detail surface is shell-specific
 * (mobile = DetailSheet, desktop = docked DecisionDetail) so a config exposes the
 * detail *kind/key* rather than the detail component.
 */
export interface TriageConfig<T> {
  /** The triage queue, already filtered + ordered. */
  items: T[]
  loading?: boolean
  getId: (t: T) => string
  /** Progress-strip headline. */
  title: string
  /** triageReasons.ts key for the left-swipe reason chips. */
  reasonsTable: string
  renderBody: (t: T) => React.ReactNode
  ariaLabel?: (t: T) => string
  leftLabel: CardLabel<T>
  rightLabel: CardLabel<T>
  rightIntent?: (t: T) => RightIntent
  onAccept: (t: T) => Promise<CommitResult>
  onReject: (t: T, code?: string) => Promise<CommitResult>
  /** Decision kind for the docked desktop detail + buildDecisionActions. */
  detailKind: DecisionKind
  /** Composite `kind:id` key the desktop cockpit feeds to DecisionDetail. */
  detailKey: (t: T) => string
  /** Compact row for the desktop "up next" rail (active = the focused card). */
  renderRow?: (t: T, active: boolean) => React.ReactNode
  /** Optional lifecycle track shown above the desktop focus card so RIGHT-swipe
   *  "advance" is legible — the lead visibly walks its pipeline. */
  stageTrack?: { stages: { key: string; label: string }[]; current: (t: T) => string }
}

type Toast = (msg: string, variant?: 'success' | 'error' | 'info', opts?: {
  action?: { label: string; onClick: () => void }
  duration?: number
}) => void

export interface TriageConfigCtx {
  toast: Toast
}

const ENRICH_GRACE_MS = 5000

async function postOk(url: string, body?: unknown): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({} as any))
    return r.ok && j?.ok !== false
  } catch {
    return false
  }
}

// ── Leads / Pipeline ──────────────────────────────────────────────────────

function leadName(l: LeadRow): string {
  return l.full_name || l.company || (l.email ? l.email.split('@')[0] : 'New lead')
}

function leadSubtitle(l: LeadRow): string {
  return [l.title, l.company].filter(Boolean).join(' · ')
}

function maxIcp(l: LeadRow): number {
  const scores = l.icp_scores ? Object.values(l.icp_scores).map(Number).filter(Number.isFinite) : []
  return scores.length > 0 ? Math.max(...scores) : (l.icp_score ?? 0)
}

/** A raw lead with no Apollo spend yet — the right-swipe should Enrich, not Promote. */
export function isLeadCandidate(l: LeadRow): boolean {
  return !l.deep_enriched_at && (l.status === 'new' || l.status === 'enriching')
}

function ventureLabel(slug?: string | null): string {
  if (!slug) return ''
  return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Enrich behind a brief undo grace: the card is already optimistically gone, but
 * the ~$0.50 Apollo webhook only fires after the grace window — clicking Undo in
 * the toast resolves `false`, which restores the card and spends nothing.
 */
function enrichWithGrace(l: LeadRow, toast: Toast): Promise<CommitResult> {
  return new Promise<CommitResult>(resolve => {
    let settled = false
    const fire = async () => {
      if (settled) return
      settled = true
      const ok = await postOk(`/api/leads/${l.id}/enrich`)
      if (!ok) toast('Could not enrich — try again.', 'error')
      resolve(ok)
    }
    const timer = setTimeout(fire, ENRICH_GRACE_MS)
    toast(`Enriching ${leadName(l)} · ~$0.50`, 'info', {
      duration: ENRICH_GRACE_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(false) // card restored — no spend
        },
      },
    })
  })
}

function renderLeadBody(l: LeadRow): React.ReactNode {
  const candidate = isLeadCandidate(l)
  const icp = maxIcp(l)
  const why = l.why_relevant?.trim()
  const tension = l.primary_tension?.trim()
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {l.fit_score != null && (
          <span className="inline-flex items-center gap-1 text-[12px] text-white/55 tabular-nums">
            <Flame size={12} className="text-rose-300" />{l.fit_score}
          </span>
        )}
        {l.primary_venture && (
          <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] bg-white/[0.06] text-white/55">
            {ventureLabel(l.primary_venture)}
          </span>
        )}
        {l.status && (
          <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] bg-violet-500/10 text-violet-200">{l.status}</span>
        )}
      </div>
      <p className="text-[20px] font-semibold text-white leading-snug">{leadName(l)}</p>
      {leadSubtitle(l) && (
        <p className="text-[14px] text-white/60 leading-relaxed mt-2">{leadSubtitle(l)}</p>
      )}

      {/* The case for a right-swipe */}
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {icp > 0 && (
          <p className="text-[13px] text-amber-200/90 leading-relaxed inline-flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 flex-shrink-0" />
            <span><span className="text-white/45">ICP fit: </span>{icp}</span>
          </p>
        )}
        {why && (
          <p className="text-[13px] text-white/70 leading-relaxed mt-2">
            <Sparkles size={12} className="inline mr-1 text-violet-300" />
            <span className="text-white/40">Why: </span>{why}
          </p>
        )}
        {tension && (
          <p className="text-[13px] text-violet-200/85 leading-relaxed mt-2">
            <span className="text-white/40">Tension: </span>{tension}
          </p>
        )}
        {!why && !tension && (
          <p className="text-[12.5px] text-white/45 leading-relaxed mt-2">
            {candidate
              ? 'Not enriched yet — swipe right to Enrich (~$0.50) and pull the full dossier, or tap to open.'
              : 'No dossier text yet. Tap to open for the full detail.'}
          </p>
        )}
      </div>
    </>
  )
}

/**
 * Build the Pipeline/Leads triage config. The triage queue is every lead that
 * still needs a decision (status new or ready), ranked by best ICP fit so the
 * strongest one is on top. RIGHT is context-aware: a raw candidate Enriches, an
 * enriched/ready lead Promotes. LEFT drops with the shared `leads` reason chips.
 */
export function buildLeadsTriageConfig(
  leads: LeadRow[],
  ctx: TriageConfigCtx,
  loading?: boolean,
): TriageConfig<LeadRow> {
  const { toast } = ctx
  const items = leads
    .filter(l => l.status === 'new' || l.status === 'ready')
    .map(l => ({ l, score: maxIcp(l) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.l)

  const onAccept = async (l: LeadRow): Promise<CommitResult> => {
    if (isLeadCandidate(l)) return enrichWithGrace(l, toast)
    const ok = await postOk('/api/leads/promote', { lead_id: l.id })
    toast(ok ? 'Promoted to an active task.' : 'Could not promote — try again.', ok ? 'success' : 'error')
    return ok
  }

  const onReject = async (l: LeadRow, code?: string): Promise<CommitResult> => {
    const ok = await triageReject('leads', l.id, l.assignee_agent, code)
    toast(ok ? 'Dropped. Vera will learn.' : 'Could not drop — try again.', ok ? 'success' : 'error')
    return ok
  }

  return {
    items,
    loading,
    getId: l => l.id,
    title: 'Handle 1-by-1',
    reasonsTable: 'leads',
    renderBody: renderLeadBody,
    ariaLabel: l => `Lead: ${leadName(l)}`,
    leftLabel: 'Drop',
    rightLabel: l => (isLeadCandidate(l) ? 'Enrich ~$0.50' : 'Promote'),
    rightIntent: () => 'advance',
    onAccept,
    onReject,
    detailKind: 'lead',
    detailKey: l => `lead:${l.id}`,
    renderRow: (l, active) => (
      <div className="min-w-0">
        <p className={`text-[12px] font-medium truncate ${active ? 'text-white' : 'text-white/75'}`}>{leadName(l)}</p>
        <p className="text-[10.5px] text-white/40 truncate">
          {[ventureLabel(l.primary_venture), maxIcp(l) > 0 ? `ICP ${maxIcp(l)}` : null, isLeadCandidate(l) ? 'candidate' : l.status]
            .filter(Boolean).join(' · ')}
        </p>
      </div>
    ),
    stageTrack: {
      stages: [
        { key: 'new', label: 'New' },
        { key: 'enriching', label: 'Enriching' },
        { key: 'ready', label: 'Ready' },
        { key: 'contacted', label: 'Contacted' },
        { key: 'conversation', label: 'Conversation' },
      ],
      current: l => l.status || 'new',
    },
  }
}
