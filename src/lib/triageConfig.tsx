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
import { ASK_LABEL, PILOT_STATE_LABEL, PILOT_STATES, PRIMARY, draftPilot } from '../hooks/usePilots'
import type { PilotState } from '../hooks/usePilots'

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

/**
 * Title-casing a slug is not a vocabulary. It happened to spell
 * `fractionl_circle` correctly and spelled `mm_ctrl` "Mm Ctrl", a fourth name
 * for CTRL alongside the registry's "CTRL", Growth's "mm-ctrl" and the check-in's
 * old "CTRL". The registry mirror owns the words; title-case is the fallback for
 * a slug it has never heard of, which is what `ventureLabel` already does.
 */
function ventureLabel(slug?: string | null): string {
  return contactVentureLabel(slug) ?? ''
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
          <span className="inline-flex items-center gap-1 text-label text-ink-faint tabular-nums">
            <Flame size={12} className="text-rose-300" />{l.fit_score}
          </span>
        )}
        {l.primary_venture && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-white/[0.06] text-ink-faint">
            {ventureLabel(l.primary_venture)}
          </span>
        )}
        {l.status && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-violet-500/10 text-violet-200">{l.status}</span>
        )}
      </div>
      <p className="text-title font-semibold text-ink leading-snug">{leadName(l)}</p>
      {leadSubtitle(l) && (
        <p className="text-ui text-ink-faint leading-relaxed mt-2">{leadSubtitle(l)}</p>
      )}

      {/* The case for a right-swipe */}
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {icp > 0 && (
          <p className="text-body text-amber-200/90 leading-relaxed inline-flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 flex-shrink-0" />
            <span><span className="text-ink-faint">ICP fit: </span>{icp}</span>
          </p>
        )}
        {why && (
          <p className="text-body text-ink-muted leading-relaxed mt-2">
            <Sparkles size={12} className="inline mr-1 text-violet-300" />
            <span className="text-ink-faint">Why: </span>{why}
          </p>
        )}
        {tension && (
          <p className="text-body text-violet-200/85 leading-relaxed mt-2">
            <span className="text-ink-faint">Tension: </span>{tension}
          </p>
        )}
        {!why && !tension && (
          <p className="text-label text-ink-faint leading-relaxed mt-2">
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
        <p className={`text-label font-medium truncate ${active ? 'text-ink' : 'text-ink-muted'}`}>{leadName(l)}</p>
        <p className="text-micro text-ink-faint truncate">
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
        <span className="inline-flex items-center gap-1 text-label text-ink-faint tabular-nums">
          <Flame size={12} className="text-rose-300" />{c.heat_score ?? 0}
        </span>
        {c.primary_venture && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-white/[0.06] text-ink-faint">
            {ventureDisplayName(c.primary_venture)}
          </span>
        )}
        {c.consent_tier && (
          <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] bg-violet-500/10 text-violet-200">{c.consent_tier}</span>
        )}
        <SuggestedMoveChip contact={c} />
      </div>
      <p className="text-title font-semibold text-ink leading-snug">{contactName(c)}</p>
      {contactSubtitle(c) && (
        <p className="text-ui text-ink-faint leading-relaxed mt-2">{contactSubtitle(c)}</p>
      )}
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {fit && (
          <p className="text-body text-amber-200/90 leading-relaxed inline-flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 flex-shrink-0" />
            <span><span className="text-ink-faint">Best fit: </span>{contactVentureLabel(fit.venture)} · {fit.score}</span>
          </p>
        )}
        {why && (
          <p className="text-body text-ink-muted leading-relaxed mt-2">
            <Sparkles size={12} className="inline mr-1 text-violet-300" />
            <span className="text-ink-faint">{why.label}: </span>{why.text}
          </p>
        )}
        {move && (
          <p className="text-body text-violet-200/85 leading-relaxed mt-2">
            <span className="text-ink-faint">The move: </span>{move}
          </p>
        )}
        {!why && !move && (
          <p className="text-label text-ink-faint leading-relaxed mt-2">
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
      <p className="text-micro text-ink-faint mt-3">Swipe right to keep warm · left to skip with a reason.</p>
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
          <p className={`text-label font-medium truncate ${active ? 'text-ink' : 'text-ink-muted'}`}>{contactName(c)}</p>
          <p className="text-micro text-ink-faint truncate">
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
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-faint tabular-nums">Fit {g.fit_score}</span>
        )}
        {typeof g.attainability_score === 'number' && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-faint tabular-nums">Reach {g.attainability_score}</span>
        )}
      </div>
      <p className="text-title font-semibold text-ink leading-snug">{g.name}</p>
      {g.one_liner && <p className="text-ui text-ink-faint leading-relaxed mt-2">{g.one_liner}</p>}
      {g.why_fit && (
        <p className="text-body text-ink-muted leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
          <span className="text-ink-faint">Why: </span>{g.why_fit.slice(0, 300)}{g.why_fit.length > 300 ? '…' : ''}
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
        <p className={`text-label font-medium truncate ${active ? 'text-ink' : 'text-ink-muted'}`}>{g.name}</p>
        <p className="text-micro text-ink-faint truncate">
          {[GUEST_TARGET_LABEL[g.podcast_target] ?? g.podcast_target, typeof g.fit_score === 'number' ? `fit ${g.fit_score}` : null]
            .filter(Boolean).join(' · ')}
        </p>
      </div>
    ),
  }
}

// ── Pilots (People · Pilots) ──────────────────────────────────────────────

/**
 * Pilot proposals, judged one at a time.
 *
 * This lane used to carry its own Accept/Skip chip pair, which was the only
 * proposal surface in the app not running on the shared deck. It cost the lane
 * three things the deck gives away for free: reason chips on a refusal, the
 * "why am I seeing this" badge that Visibility has had for months, and the undo
 * that lives in the reason bar. Worse, its Skip wrote nothing at all.
 *
 * Note the asymmetry with every other config here: a proposal has no row yet,
 * so BOTH verdicts are writes. Accept lists the person, and a refusal records
 * them as `not_now` with a coded vote rather than dropping them on the floor.
 */
export interface PilotProposalItem {
  contact_id: string
  full_name: string | null
  title: string | null
  company: string | null
  why_face: string
  score: number
  ask_kind?: 'buyer' | 'intro' | 'collaborator'
  ask_line?: string
  /** What the enrichment already knew. The deck is where a person is first
   *  judged, so the evidence belongs on this card, not only after listing. */
  intent_stance?: string | null
  intent_evidence?: string | null
  intent_evidence_url?: string | null
  last_post_at?: string | null
  followers?: number | null
  is_influencer?: boolean | null
  is_creator?: boolean | null
}

const PILOT_ASK_TONE: Record<string, string> = {
  buyer: 'bg-emerald-500/15 text-emerald-200',
  intro: 'bg-sky-500/15 text-sky-200',
  collaborator: 'bg-amber-500/15 text-amber-200',
}
// The labels themselves live with the type, in hooks/usePilots. They were
// duplicated here and drifted out of the one-system rule (AGENTS.md): two
// copies of the same three strings, either of which could be edited alone.

/** The same 90-day intent cliff public.intent_live_score applies. */
function livePost(p: PilotProposalItem): boolean {
  const quote = (p.intent_evidence || '').trim()
  const url = (p.intent_evidence_url || '').trim()
  if (!quote || !/^https?:\/\//i.test(url) || !p.last_post_at) return false
  const age = Date.now() - new Date(p.last_post_at).getTime()
  return Number.isFinite(age) && age <= 90 * 86_400_000
}

function renderPilotBody(p: PilotProposalItem): React.ReactNode {
  const role = [p.title, p.company].filter(Boolean).join(' at ')
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className={`text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] ${
          p.ask_kind ? PILOT_ASK_TONE[p.ask_kind] : 'bg-violet-500/15 text-violet-200'
        }`}>
          {p.ask_kind ? ASK_LABEL[p.ask_kind] : 'In your network'}
        </span>
        {typeof p.score === 'number' && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-faint">Fit {p.score}</span>
        )}
        {/* Reach, where we actually hold evidence of it. followers is a real
            Coresignal count; the two badges are LinkedIn's own, and scarce.
            They were bought, stored, used inside the ranker's hub term and
            never shown to anyone until now. */}
        {p.is_influencer && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200">Influencer</span>
        )}
        {!p.is_influencer && p.is_creator && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-200/80">Creator</span>
        )}
        {typeof p.followers === 'number' && p.followers >= 5000 && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-faint tabular-nums">
            {p.followers >= 1000 ? `${Math.round(p.followers / 1000)}k followers` : `${p.followers} followers`}
          </span>
        )}
      </div>
      <p className="text-ui font-semibold text-ink leading-snug">{p.full_name || 'Unnamed contact'}</p>
      {role && <p className="text-label text-ink-faint leading-snug mt-0.5">{role}</p>}
      <p className="text-label text-ink-muted leading-snug mt-2">
        <span className="text-ink-faint">Why them: </span>{p.why_face}
      </p>
      {p.ask_line && (
        <p className="text-label text-ink-muted leading-snug mt-2">
          <span className="text-ink-faint">Ask them: </span>{p.ask_line}
        </p>
      )}
      {/* What they said, in their words, with the post to check it against.
          Cited or silent: no quote renders without an http source and a date
          inside the same 90-day cliff the ranker scores on. */}
      {livePost(p) && (
        <p className="text-label text-ink-muted leading-snug mt-2">
          <span className="text-ink-faint">They posted: </span>
          {p.intent_evidence}
          <a
            href={p.intent_evidence_url || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="ml-1.5 text-violet-300 hover:text-violet-200"
          >
            their post
          </a>
        </p>
      )}
    </>
  )
}

export function buildPilotTriageConfig(
  proposals: PilotProposalItem[],
  ctx: TriageConfigCtx,
  handlers: {
    accept: (p: PilotProposalItem) => Promise<boolean>
    reject: (p: PilotProposalItem, code?: string) => Promise<boolean>
  },
  loading?: boolean,
): TriageConfig<PilotProposalItem> {
  const { toast } = ctx

  const onAccept = async (p: PilotProposalItem): Promise<CommitResult> => {
    const ok = await handlers.accept(p)
    if (ok) toast(`${p.full_name || 'Added'} is on the list.`, 'success')
    return ok
  }
  const onReject = async (p: PilotProposalItem, code?: string): Promise<CommitResult> => {
    const ok = await handlers.reject(p, code)
    if (ok) toast('Not this one. Vera will learn from that.', 'success')
    return ok
  }

  return {
    items: proposals,
    loading,
    getId: p => p.contact_id,
    title: 'People to judge',
    reasonsTable: 'pilot_deals',
    renderBody: renderPilotBody,
    ariaLabel: p => `Pilot proposal: ${p.full_name || 'unnamed contact'}`,
    leftLabel: 'Skip',
    rightLabel: 'Keep',
    rightIntent: () => 'advance',
    onAccept,
    onReject,
    renderDetail: p => <div className="text-label text-ink-muted leading-relaxed">{renderPilotBody(p)}</div>,
    renderRow: (p, active) => (
      <div className="min-w-0">
        <p className={`text-label font-medium truncate ${active ? 'text-ink' : 'text-ink-muted'}`}>
          {p.full_name || 'Unnamed contact'}
        </p>
        <p className="text-micro text-ink-faint truncate">
          {[p.company, typeof p.score === 'number' ? `fit ${p.score}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    ),
  }
}

/**
 * The ladder deck: listed and drafted deals, one person at a time.
 *
 * Krish, 2026-09-16: "The room should be a swipe experience like the other
 * tabs." The proposals deck already swipes, because accept and skip are the
 * only two verdicts there. This is the harder half: a deal sits on a nine rung
 * ladder whose forward moves are named ("Draft it", "I sent it", "They
 * replied"), so the gesture has to carry a different meaning per card.
 *
 * It follows the content lane's grammar, which solved the same problem:
 *   - right = the named next rung, labelled per state from PRIMARY
 *   - left  = Not now, through the reason chips this surface already has
 *   - a rung that cannot be done from a gesture bounces: it opens what it
 *     needs and returns false, which restores the card
 *
 * `listed` is the one rung that spends money. Its forward move drafts, which
 * calls web research plus an LLM and takes about ten seconds, so a mis-swipe
 * would burn it. It goes behind the same five second Undo toast the Leads deck
 * uses for its paid enrich (`enrichWithGrace` above) - Krish's call, and the
 * existing house answer rather than a new one.
 */
export interface PilotDealItem {
  id: string
  state: PilotState
  contact: { full_name: string | null; title: string | null; company: string | null } | null
  why_face: string
  ask_kind: 'buyer' | 'intro' | 'collaborator' | null
  ask_line: string | null
  trigger_signal: string | null
  intent_evidence: string | null
  last_post_at: string | null
  draft_subject: string | null
}

const DRAFT_GRACE_MS = 5000

function dealName(d: PilotDealItem): string {
  return d.contact?.full_name || 'This person'
}

/** What the right swipe is called on this card. Never a bare "Advance": the
 *  word has to be the thing that is about to happen to a named human. */
function dealRightLabel(d: PilotDealItem): string {
  if (d.state === 'listed') return 'Draft it'
  if (d.state === 'pilot_booked') return 'Paid'
  return PRIMARY[d.state]?.label ?? 'Next'
}

/** The draft, deferred behind an Undo. Resolving false restores the card and
 *  nothing is spent. Same shape as enrichWithGrace; see its comment. */
function draftWithGrace(d: PilotDealItem, toast: Toast): Promise<CommitResult> {
  return new Promise<CommitResult>(resolve => {
    let settled = false
    const fire = async () => {
      if (settled) return
      settled = true
      try {
        const updated = await draftPilot(d.id)
        toast(
          updated?.draft_url
            ? `Drafted for ${dealName(d)}, and it is in your Gmail drafts. Nothing was sent.`
            : `Drafted for ${dealName(d)}. No Gmail draft for this one, so use the contact button.`,
          'success',
        )
        resolve(true)
      } catch (err) {
        const msg = (err as Error)?.message || ''
        toast(
          msg === 'google_not_configured'
            ? 'Google is not set up on the server, so no draft can be made yet.'
            : `Could not draft: ${msg || 'try again'}`,
          'error',
        )
        resolve(false)
      }
    }
    const timer = setTimeout(fire, DRAFT_GRACE_MS)
    toast(`Drafting for ${dealName(d)}`, 'info', {
      duration: DRAFT_GRACE_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(false) // card restored, no research and no model call
        },
      },
    })
  })
}

function renderDealBody(d: PilotDealItem): React.ReactNode {
  const role = [d.contact?.title, d.contact?.company].filter(Boolean).join(' at ')
  const quote = liveDealQuote(d)
  // Deliberately short. A SwipeCard is a fixed box that clips, so everything
  // here competes for the same ~135 points on a phone: the first draft of this
  // body carried why_them and the draft subject too and overflowed by 150.
  // The deck answers "who is this and what happens if I swipe"; the rest is
  // one tap away on the full card. SwipeDeck prints its own "tap to open" hint,
  // so this does not repeat it.
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200">
          {PILOT_STATE_LABEL[d.state]}
        </span>
        {d.ask_kind && (
          <span className={`text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] ${PILOT_ASK_TONE[d.ask_kind]}`}>
            {ASK_LABEL[d.ask_kind]}
          </span>
        )}
      </div>
      <p className="text-ui font-semibold text-ink leading-snug">{dealName(d)}</p>
      {role && <p className="text-label text-ink-faint leading-snug mt-0.5">{role}</p>}
      {d.ask_line && (
        <p className="text-label text-ink-muted leading-snug mt-1.5">{d.ask_line}</p>
      )}
      {/* Why now, from whichever source has one. Cited or silent, the same rule
          the full card keeps. */}
      {(d.trigger_signal || quote) && (
        <p data-testid="pilot-why-now" className="text-label text-ink-muted leading-snug mt-1.5">
          <span className="text-ink-faint">Why now: </span>{d.trigger_signal || quote}
        </p>
      )}
    </>
  )
}

/** The same 90-day intent cliff the card and the server both apply. */
function liveDealQuote(d: PilotDealItem): string | null {
  const quote = (d.intent_evidence || '').trim()
  if (!quote || !d.last_post_at) return null
  const age = Date.now() - new Date(d.last_post_at).getTime()
  return Number.isFinite(age) && age <= 90 * 86_400_000 ? quote : null
}

export function buildPilotLadderConfig(
  deals: PilotDealItem[],
  ctx: TriageConfigCtx,
  handlers: {
    /** Stamp the next rung. Returns whether the write landed. */
    advance: (d: PilotDealItem, next: PilotState, done: string) => Promise<boolean>
    /** Park it. The reason code is a chip from the pilot_deals table. */
    notNow: (d: PilotDealItem, code?: string) => Promise<boolean>
    /** The rungs a gesture cannot finish: open what they need, card restored. */
    bounce: (d: PilotDealItem) => void
  },
  loading?: boolean,
): TriageConfig<PilotDealItem> {
  const { toast } = ctx

  const onAccept = async (d: PilotDealItem): Promise<CommitResult> => {
    if (d.state === 'listed') return draftWithGrace(d, toast)
    // Paid needs an amount, so the gesture cannot complete it. Open the modal
    // and put the card back, the way the content deck bounces to its composer.
    if (d.state === 'pilot_booked') { handlers.bounce(d); return false }
    const step = PRIMARY[d.state]
    if (!step) return false
    const ok = await handlers.advance(d, step.next, step.done)
    if (ok) toast(`${dealName(d)}: ${step.done}`, 'success')
    return ok
  }

  const onReject = async (d: PilotDealItem, code?: string): Promise<CommitResult> => {
    const ok = await handlers.notNow(d, code)
    if (ok) toast(`${dealName(d)} parked. It can come back to the list later.`, 'success')
    return ok
  }

  return {
    items: deals,
    loading,
    getId: d => d.id,
    // Overridden by the lane with the live counts: the deck's progress strip
    // is already on screen, so it carries them for free and the phone does not
    // spend a whole band on a line the strip could hold.
    title: 'Your pilots',
    reasonsTable: 'pilot_deals',
    renderBody: renderDealBody,
    ariaLabel: d => `${dealName(d)}, ${PILOT_STATE_LABEL[d.state].toLowerCase()}`,
    leftLabel: 'Not now',
    rightLabel: dealRightLabel,
    rightIntent: () => 'advance',
    onAccept,
    onReject,
    stageTrack: {
      stages: PILOT_STATES.filter(s => s !== 'not_now').map(s => ({ key: s, label: PILOT_STATE_LABEL[s] })),
      current: d => d.state,
    },
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
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-faint tabular-nums">Fit {t.relevance_score}</span>
        )}
        {daysToDeadline !== null && (
          <span className={`text-micro px-1.5 py-0.5 rounded tabular-nums ${
            daysToDeadline < 0 ? 'bg-rose-500/10 text-rose-300' :
            daysToDeadline <= 14 ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.06] text-ink-faint'}`}>
            {daysToDeadline < 0 ? `${Math.abs(daysToDeadline)}d ago` : daysToDeadline === 0 ? 'today' : `${daysToDeadline}d left`}
          </span>
        )}
      </div>
      <p className="text-title font-semibold text-ink leading-snug">{t.title}</p>
      {t.why_relevant && (
        <p className="text-body text-ink-muted leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
          <Sparkles size={11} className="inline mr-1 text-violet-300" />
          <span className="text-ink-faint">Why: </span>{t.why_relevant.slice(0, 280)}{t.why_relevant.length > 280 ? '…' : ''}
        </p>
      )}
      {t.suggested_talk_title && (
        <p className="text-label text-ink-muted leading-snug mt-2 flex-shrink-0">
          <span className="text-ink-faint">Pitch: </span><span className="italic">{t.suggested_talk_title}</span>
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
        <p className={`text-label font-medium truncate ${active ? 'text-ink' : 'text-ink-muted'}`}>{t.title}</p>
        <p className="text-micro text-ink-faint truncate">
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
        <span className="text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] font-semibold bg-white/[0.08] text-ink-muted">{i.state}</span>
        {i.lane && <span className="text-micro uppercase tracking-[0.14em] text-ink-faint">{i.lane.replace(/_/g, ' ')}</span>}
        {typeof i.brand_fit_score === 'number' && (
          <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-faint tabular-nums">Fit {i.brand_fit_score}</span>
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
      <p className="text-title font-semibold text-ink leading-snug">{i.idea}</p>
      {clusterSummary && (
        <p className="mt-2 text-label text-violet-200/70 italic leading-snug">{clusterSummary}</p>
      )}
      <div className="mt-3 overflow-hidden flex-1 min-h-0">
        {why ? (
          <p className="text-body text-ink-muted leading-relaxed">
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
          <p className={`text-label font-medium truncate ${active ? 'text-ink' : 'text-ink-muted'}`}>{i.idea}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-micro text-ink-faint truncate">
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
