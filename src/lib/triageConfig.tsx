import React from 'react'
import { Target, Sparkles, Flame, Mic } from '@/lib/icons'
import type { CommitResult } from '../hooks/useSwipeTriage'
import type { CardLabel, RightIntent } from '../components/shared/SwipeDeck'
import type { DecisionKind } from '../components/DecisionDetail'
import type { LeadRow } from '../hooks/useRealtimeLeads'
import type { ContactRow } from '../hooks/useRealtimeContacts'
import type { GuestRow } from '../hooks/useRealtimeGuests'
import type { VisibilityTargetRow } from '../hooks/useVisibilityTargets'
import type { ContentIdeaRow, IdeaState } from '../hooks/useRealtimeContentIdeas'
import { triageReject, triagePromote, feedbackVote } from './triageActions'
import { ADVANCE_NEXT, STATE_PRIORITY, advanceMode, nextState as nextContentState } from './contentEngine'
import { isHandQueue } from './contactTriage'
import { topFit, dossierMove, contactRationale, suggestedMove, ventureLabel as contactVentureLabel } from './contactSignals'
import { ventureDisplayName } from '../components/ContactSourcePill'
import { SuggestedMoveChip, MOVE_TONE_TEXT } from '../components/ContactCard'

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
  /** Decision kind for the docked desktop detail + buildDecisionActions.
   *  Omit when the surface isn't a DecisionKind (e.g. contacts) and supply
   *  `renderDetail` instead. */
  detailKind?: DecisionKind
  /** Composite `kind:id` key the desktop cockpit feeds to DecisionDetail. */
  detailKey?: (t: T) => string
  /** Custom docked detail panel for surfaces with no DecisionDetail kind. */
  renderDetail?: (t: T) => React.ReactNode
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
          <span className="inline-flex items-center gap-1 text-label text-white/55 tabular-nums">
            <Flame size={12} className="text-rose-300" />{l.fit_score}
          </span>
        )}
        {l.primary_venture && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-white/[0.06] text-white/55">
            {ventureLabel(l.primary_venture)}
          </span>
        )}
        {l.status && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-violet-500/10 text-violet-200">{l.status}</span>
        )}
      </div>
      <p className="text-title font-semibold text-white leading-snug">{leadName(l)}</p>
      {leadSubtitle(l) && (
        <p className="text-ui text-white/60 leading-relaxed mt-2">{leadSubtitle(l)}</p>
      )}

      {/* The case for a right-swipe */}
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {icp > 0 && (
          <p className="text-body text-amber-200/90 leading-relaxed inline-flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 flex-shrink-0" />
            <span><span className="text-white/45">ICP fit: </span>{icp}</span>
          </p>
        )}
        {why && (
          <p className="text-body text-white/70 leading-relaxed mt-2">
            <Sparkles size={12} className="inline mr-1 text-violet-300" />
            <span className="text-white/40">Why: </span>{why}
          </p>
        )}
        {tension && (
          <p className="text-body text-violet-200/85 leading-relaxed mt-2">
            <span className="text-white/40">Tension: </span>{tension}
          </p>
        )}
        {!why && !tension && (
          <p className="text-label text-white/45 leading-relaxed mt-2">
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
    toast(ok ? 'Dropped. Vera will learn from that.' : 'Could not drop — try again.', ok ? 'success' : 'error')
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
        <p className={`text-label font-medium truncate ${active ? 'text-white' : 'text-white/75'}`}>{leadName(l)}</p>
        <p className="text-micro text-white/40 truncate">
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

// ── Contacts / Network ────────────────────────────────────────────────────

function contactName(c: ContactRow): string {
  return c.full_name || c.company || (c.email ? c.email.split('@')[0] : '—')
}

function contactSubtitle(c: ContactRow): string {
  return [c.title, c.company].filter(Boolean).join(' @ ')
}

function renderContactBody(c: ContactRow): React.ReactNode {
  const fit = topFit(c.fit_scores)
  const why = contactRationale(c)
  const move = dossierMove(c.dossier)
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 text-label text-white/55 tabular-nums">
          <Flame size={12} className="text-rose-300" />{c.heat_score ?? 0}
        </span>
        {c.primary_venture && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-white/[0.06] text-white/55">
            {ventureDisplayName(c.primary_venture)}
          </span>
        )}
        {c.consent_tier && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-violet-500/10 text-violet-200">{c.consent_tier}</span>
        )}
        <SuggestedMoveChip contact={c} />
      </div>
      <p className="text-title font-semibold text-white leading-snug">{contactName(c)}</p>
      {contactSubtitle(c) && (
        <p className="text-ui text-white/60 leading-relaxed mt-2">{contactSubtitle(c)}</p>
      )}
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {fit && (
          <p className="text-body text-amber-200/90 leading-relaxed inline-flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 flex-shrink-0" />
            <span><span className="text-white/45">Best fit: </span>{contactVentureLabel(fit.venture)} · {fit.score}</span>
          </p>
        )}
        {why && (
          <p className="text-body text-white/70 leading-relaxed mt-2">
            <Sparkles size={12} className="inline mr-1 text-violet-300" />
            <span className="text-white/40">{why.label}: </span>{why.text}
          </p>
        )}
        {move && (
          <p className="text-body text-violet-200/85 leading-relaxed mt-2">
            <span className="text-white/40">The move: </span>{move}
          </p>
        )}
        {!why && !move && (
          <p className="text-label text-white/45 leading-relaxed mt-2">
            Not researched yet — judge on heat {c.heat_score ?? 0}
            {fit ? `, ${contactVentureLabel(fit.venture)} fit ${fit.score}` : ''}
            {c.origin_campaign ? `, via ${c.origin_campaign}` : ''}.
          </p>
        )}
      </div>
    </>
  )
}

function renderContactDetail(c: ContactRow): React.ReactNode {
  return (
    <div className="p-5 flex flex-col h-full">
      <span className="text-micro uppercase tracking-[0.14em] text-rose-300/80 mb-3">Contact</span>
      {renderContactBody(c)}
      {c.email && (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <a href={`mailto:${c.email}`} className="text-label text-violet-300 hover:text-violet-200">Email {c.email} ↗</a>
        </div>
      )}
      <p className="text-micro text-white/35 mt-3">Swipe right to keep warm · left to skip with a reason.</p>
    </div>
  )
}

/**
 * Build the Network/Contacts triage config. The queue is the warm "hand queue"
 * (isHandQueue), hottest first. RIGHT keeps (+1), LEFT skips (−1, which also
 * suppresses the contact from the warm queue server-side). Contacts aren't a
 * DecisionKind, so the docked desktop detail is a custom panel.
 */
export function buildContactsTriageConfig(
  contacts: ContactRow[],
  ctx: TriageConfigCtx,
  loading?: boolean,
): TriageConfig<ContactRow> {
  const { toast } = ctx
  const items = contacts.filter(isHandQueue).sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0))

  const onAccept = async (c: ContactRow): Promise<CommitResult> => {
    const ok = await feedbackVote('contacts', c.id, 1, c.owner_agent)
    toast(ok ? 'Kept warm and logged.' : 'Could not save — try again.', ok ? 'success' : 'error')
    return ok
  }

  const onReject = async (c: ContactRow, code?: string): Promise<CommitResult> => {
    const ok = await feedbackVote('contacts', c.id, -1, c.owner_agent, code)
    toast(ok ? 'Skipped. Vera will learn from that.' : 'Could not save — try again.', ok ? 'success' : 'error')
    return ok
  }

  return {
    items,
    loading,
    getId: c => c.id,
    title: 'Handle 1-by-1',
    reasonsTable: 'contacts',
    renderBody: renderContactBody,
    ariaLabel: c => `Contact: ${contactName(c)}`,
    leftLabel: 'Skip',
    rightLabel: 'Keep',
    onAccept,
    onReject,
    renderDetail: renderContactDetail,
    renderRow: (c, active) => {
      const move = suggestedMove(c)
      return (
        <div className="min-w-0">
          <p className={`text-label font-medium truncate ${active ? 'text-white' : 'text-white/75'}`}>{contactName(c)}</p>
          <p className="text-micro text-white/40 truncate">
            {[ventureDisplayName(c.primary_venture), `heat ${c.heat_score ?? 0}`].filter(Boolean).join(' · ')}
          </p>
          {move && (
            <p className={`text-micro truncate ${MOVE_TONE_TEXT[move.tone]}`} title="Suggested move">{move.label}</p>
          )}
        </div>
      )
    },
  }
}

// ── Guests (Visibility · inbound) ─────────────────────────────────────────

const GUEST_TARGET_LABEL: Record<string, string> = {
  signal_noise: 'Signal & Noise',
  builder_economy: 'Builder Economy',
  either: 'Either show',
}

function renderGuestBody(g: GuestRow): React.ReactNode {
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 text-micro px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200">
          <Mic size={9} />{GUEST_TARGET_LABEL[g.podcast_target] ?? g.podcast_target}
        </span>
        {g.quality_score && (
          <span className={`text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] ${
            g.quality_score === 'green' ? 'bg-emerald-500/10 text-emerald-300' :
            g.quality_score === 'amber' ? 'bg-amber-500/10 text-amber-300' : 'bg-rose-500/10 text-rose-300'}`}>
            {g.quality_score}
          </span>
        )}
        {typeof g.fit_score === 'number' && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {g.fit_score}</span>
        )}
        {typeof g.attainability_score === 'number' && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Reach {g.attainability_score}</span>
        )}
      </div>
      <p className="text-title font-semibold text-white leading-snug">{g.name}</p>
      {g.one_liner && <p className="text-ui text-white/60 leading-relaxed mt-2">{g.one_liner}</p>}
      {g.why_fit && (
        <p className="text-body text-white/65 leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
          <span className="text-white/35">Why: </span>{g.why_fit.slice(0, 300)}{g.why_fit.length > 300 ? '…' : ''}
        </p>
      )}
    </>
  )
}

/**
 * Build the Guests (Visibility · inbound) triage config. Queue = untriaged
 * guests (scouted/enriched), best-fit first. RIGHT pitches, LEFT skips.
 */
export function buildGuestsTriageConfig(
  guests: GuestRow[],
  ctx: TriageConfigCtx,
  loading?: boolean,
): TriageConfig<GuestRow> {
  const { toast } = ctx
  const items = guests
    .filter(g => g.status === 'scouted' || g.status === 'enriched')
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))

  const onAccept = async (g: GuestRow): Promise<CommitResult> => {
    const ok = await triagePromote('guests', g.id, 'nell')
    toast(ok ? 'Pitched. Vera will learn from that.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }
  const onReject = async (g: GuestRow, code?: string): Promise<CommitResult> => {
    const ok = await triageReject('guests', g.id, 'nell', code)
    toast(ok ? 'Skipped. Vera will learn from that.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }

  return {
    items,
    loading,
    getId: g => g.id,
    title: 'Guests to triage',
    reasonsTable: 'guests',
    renderBody: renderGuestBody,
    ariaLabel: g => `Guest: ${g.name}`,
    leftLabel: 'Skip',
    rightLabel: 'Pitch',
    rightIntent: () => 'advance',
    onAccept,
    onReject,
    detailKind: 'guest',
    detailKey: g => `guest:${g.id}`,
    renderRow: (g, active) => (
      <div className="min-w-0">
        <p className={`text-label font-medium truncate ${active ? 'text-white' : 'text-white/75'}`}>{g.name}</p>
        <p className="text-micro text-white/40 truncate">
          {[GUEST_TARGET_LABEL[g.podcast_target] ?? g.podcast_target, typeof g.fit_score === 'number' ? `fit ${g.fit_score}` : null]
            .filter(Boolean).join(' · ')}
        </p>
      </div>
    ),
  }
}

// ── Visibility targets (Visibility · outbound) ────────────────────────────

function renderTargetBody(t: VisibilityTargetRow): React.ReactNode {
  const daysToDeadline = t.deadline_at
    ? Math.ceil((new Date(t.deadline_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-violet-500/15 text-violet-200">{t.type.replace(/_/g, ' ')}</span>
        {typeof t.relevance_score === 'number' && t.relevance_score > 0 && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {t.relevance_score}</span>
        )}
        {daysToDeadline !== null && (
          <span className={`text-micro px-1.5 py-0.5 rounded tabular-nums ${
            daysToDeadline < 0 ? 'bg-rose-500/10 text-rose-300' :
            daysToDeadline <= 14 ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.06] text-white/55'}`}>
            {daysToDeadline < 0 ? `${Math.abs(daysToDeadline)}d ago` : daysToDeadline === 0 ? 'today' : `${daysToDeadline}d left`}
          </span>
        )}
      </div>
      <p className="text-title font-semibold text-white leading-snug">{t.title}</p>
      {t.why_relevant && (
        <p className="text-body text-white/65 leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
          <Sparkles size={11} className="inline mr-1 text-violet-300" />
          <span className="text-white/35">Why: </span>{t.why_relevant.slice(0, 280)}{t.why_relevant.length > 280 ? '…' : ''}
        </p>
      )}
      {t.suggested_talk_title && (
        <p className="text-label text-white/80 leading-snug mt-2 flex-shrink-0">
          <span className="text-white/40">Pitch: </span><span className="italic">{t.suggested_talk_title}</span>
        </p>
      )}
    </>
  )
}

/**
 * Build the Visibility targets (outbound) triage config. Queue = sourced/queued
 * targets, most-relevant first. RIGHT applies, LEFT passes. Visibility keeps its
 * own action bar inside VisibilityTargetDetail (the docked DecisionDetail).
 */
export function buildVisibilityTargetsTriageConfig(
  targets: VisibilityTargetRow[],
  ctx: TriageConfigCtx,
  loading?: boolean,
): TriageConfig<VisibilityTargetRow> {
  const { toast } = ctx
  const items = targets
    .filter(t => t.status === 'sourced' || t.status === 'queued')
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))

  const onAccept = async (t: VisibilityTargetRow): Promise<CommitResult> => {
    const ok = await triagePromote('visibility_targets', t.id, 'nova')
    toast(ok ? 'Applied. Vera will learn from that.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }
  const onReject = async (t: VisibilityTargetRow, code?: string): Promise<CommitResult> => {
    const ok = await triageReject('visibility_targets', t.id, 'nova', code)
    toast(ok ? 'Passed. Vera will learn from that.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }

  return {
    items,
    loading,
    getId: t => t.id,
    title: 'Targets to triage',
    reasonsTable: 'visibility_targets',
    renderBody: renderTargetBody,
    ariaLabel: t => `Target: ${t.title}`,
    leftLabel: 'Pass',
    rightLabel: 'Apply',
    rightIntent: () => 'advance',
    onAccept,
    onReject,
    detailKind: 'visibility',
    detailKey: t => `visibility:${t.id}`,
    renderRow: (t, active) => (
      <div className="min-w-0">
        <p className={`text-label font-medium truncate ${active ? 'text-white' : 'text-white/75'}`}>{t.title}</p>
        <p className="text-micro text-white/40 truncate">
          {[t.type.replace(/_/g, ' '), typeof t.relevance_score === 'number' ? `fit ${t.relevance_score}` : null]
            .filter(Boolean).join(' · ')}
        </p>
      </div>
    ),
  }
}

// ── Content ideas ─────────────────────────────────────────────────────────
// State machine imported from the single source of truth (lib/contentEngine);
// no local advance-map copy (the duplication was CORE_PROBLEM F-2).

const CONTENT_RIGHT_LABEL: Partial<Record<IdeaState, string>> = {
  seeded: 'Research',
  researching: 'Draft',
  drafting: 'Review',
}

function openIdeaComposer(id: string) {
  try { window.location.hash = `#/content?idea=${id}` } catch { /* noop */ }
}

async function patchIdeaState(id: string, state: IdeaState): Promise<boolean> {
  try {
    const r = await fetch('/api/content-ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, state }),
    })
    return r.ok
  } catch {
    return false
  }
}

function renderContentBody(i: ContentIdeaRow): React.ReactNode {
  const thesis = (i.thesis || '').trim()
  const draft = (i.body || '').trim()
  const why = thesis || draft
  const relatedCount = Array.isArray(i.related_idea_ids) ? i.related_idea_ids.length : 0
  const clusterSummary = (i.meta as any)?.cluster_summary || null
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] font-semibold bg-white/[0.08] text-white/65">{i.state}</span>
        {i.lane && <span className="text-micro uppercase tracking-[0.14em] text-white/40">{i.lane.replace(/_/g, ' ')}</span>}
        {typeof i.brand_fit_score === 'number' && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {i.brand_fit_score}</span>
        )}
        {draft && <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200/80">draft</span>}
        {relatedCount >= 2 && (
          <span
            className="text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 border border-violet-400/30 font-medium"
            title="This card is part of an auto-discovered narrative cluster. Open it in the composer to synthesize the cluster into one piece."
          >
            +{relatedCount} related · narrative
          </span>
        )}
      </div>
      <p className="text-title font-semibold text-white leading-snug">{i.idea}</p>
      {clusterSummary && (
        <p className="mt-2 text-label text-violet-200/70 italic leading-snug">{clusterSummary}</p>
      )}
      <div className="mt-3 overflow-hidden flex-1 min-h-0">
        {why ? (
          <p className="text-body text-white/75 leading-relaxed">
            <span className="text-violet-300/80 font-medium">{thesis ? 'Angle: ' : ''}</span>
            {why.slice(0, 320)}{why.length > 320 ? '…' : ''}
          </p>
        ) : (
          <p className="text-label text-amber-200/70">No draft or thesis yet — raw seed. Swipe right to research it.</p>
        )}
      </div>
    </>
  )
}

/**
 * Build the Content triage config. Deck = active backlog with a clear next step
 * (seeded/researching/drafting), worst-state first. RIGHT advances one stage;
 * LEFT drops with the shared `content_ideas` reason chips. Human gates
 * (review/approved) live in the docked detail rail, not the swipe.
 */
export function buildContentTriageConfig(
  ideas: ContentIdeaRow[],
  ctx: TriageConfigCtx,
  loading?: boolean,
): TriageConfig<ContentIdeaRow> {
  const { toast } = ctx
  const items = ideas
    .filter(i => !i.buried_at && ADVANCE_NEXT[i.state as keyof typeof ADVANCE_NEXT] != null)
    .sort((a, b) => {
      const pa = STATE_PRIORITY[a.state] ?? 9
      const pb = STATE_PRIORITY[b.state] ?? 9
      if (pa !== pb) return pa - pb
      return (a.updated_at || '') < (b.updated_at || '') ? -1 : 1
    })

  const onAccept = async (i: ContentIdeaRow): Promise<CommitResult> => {
    // Anti-zombie (CORE_PROBLEM F-1): only seeded→researching is a pure relabel.
    // researching/drafting RIGHT opens the Composer to develop a real draft —
    // never a bare relabel into a content-bearing state.
    if (advanceMode(i.state) !== 'relabel') {
      openIdeaComposer(i.id)
      return false // not terminal: the card stays until real content moves it
    }
    const next = nextContentState(i.state)
    if (!next) { openIdeaComposer(i.id); return false }
    const ok = await patchIdeaState(i.id, next)
    if (ok) {
      void feedbackVote('content_ideas', i.id, 1, 'cleo', 'content_advanced')
      toast(`Advanced to ${next}.`, 'success')
    } else {
      toast('Could not update — try again.', 'error')
    }
    return ok
  }
  const onReject = async (i: ContentIdeaRow, code?: string): Promise<CommitResult> => {
    const ok = await triageReject('content_ideas', i.id, 'cleo', code)
    toast(ok ? 'Dropped. Vera will learn from that.' : 'Could not drop — try again.', ok ? 'success' : 'error')
    return ok
  }

  return {
    items,
    loading,
    getId: i => i.id,
    title: 'Clear the pile',
    reasonsTable: 'content_ideas',
    renderBody: renderContentBody,
    ariaLabel: i => `Content idea: ${i.idea}`,
    leftLabel: 'Drop',
    rightLabel: i => CONTENT_RIGHT_LABEL[i.state] ?? 'Advance',
    rightIntent: () => 'advance',
    onAccept,
    onReject,
    detailKind: 'idea',
    detailKey: i => `idea:${i.id}`,
    stageTrack: {
      stages: [
        { key: 'seeded', label: 'Seeded' },
        { key: 'researching', label: 'Researching' },
        { key: 'drafting', label: 'Drafting' },
        { key: 'review', label: 'Review' },
        { key: 'approved', label: 'Approved' },
      ],
      current: i => i.state,
    },
    renderRow: (i, active) => {
      const relatedCount = Array.isArray(i.related_idea_ids) ? i.related_idea_ids.length : 0
      return (
        <div className="min-w-0">
          <p className={`text-label font-medium truncate ${active ? 'text-white' : 'text-white/75'}`}>{i.idea}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-micro text-white/40 truncate">
              {[i.state, i.lane ? i.lane.replace(/_/g, ' ') : null].filter(Boolean).join(' · ')}
            </span>
            {relatedCount >= 2 && (
              <span className="text-micro text-violet-300/90 font-medium tabular-nums" title={`Part of a ${relatedCount + 1}-card narrative cluster`}>
                +{relatedCount}
              </span>
            )}
          </div>
        </div>
      )
    },
  }
}
