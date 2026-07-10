import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Layers, ChevronRight, Target, Sparkles } from 'lucide-react'
import { MobileShell, TabHeader, FeedCard, FeedRow, EmptyState, MobileLoadingScreen } from './primitives'
import { MobileShell as MobileStage } from './MobileShell'
import { ContactImportDropzone } from '../ContactImportDropzone'
import { ventureDisplayName } from '../ContactSourcePill'
import { humanAge } from '../../lib/ageHelpers'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { useRealtimeContacts, type ContactRow } from '../../hooks/useRealtimeContacts'
import { isTestRecord } from '../../lib/recordHygiene'
import { predictiveScore } from '../../lib/networkScore'
import { NextNetworkHero } from '../contacts/NextNetworkHero'
import { isHandQueue } from '../../lib/contactTriage'
import { OutreachDraftSheet, type DraftTarget } from '../OutreachDraftSheet'
import { LeadSheet } from '../LeadSheet'
import { SwipeDeck } from '../shared/SwipeDeck'
import { useSwipeTriage } from '../../hooks/useSwipeTriage'
import { reasonsFor } from '../../lib/triageReasons'
import { feedbackVote } from '../../lib/triageActions'
import { topFit, dossierMove, contactRationale, ventureLabel } from '../../lib/contactSignals'
import { SuggestedMoveChip } from '../ContactCard'

const VENTURES: Array<{ slug: string; label: string }> = [
  { slug: 'mindmaker', label: 'Mindmaker' },
  { slug: 'meliora', label: 'Meliora' },
  { slug: 'adfixus', label: 'AdFixus' },
  { slug: 'signal_noise', label: 'Signal & Noise' },
  { slug: 'builder_economy', label: 'Builder Economy' },
  { slug: 'fractionl_pulse', label: 'Fractionl Pulse' },
  { slug: 'investor', label: 'Investor' },
]

function heatDot(score?: number | null): string {
  const s = score ?? 0
  if (s >= 75) return 'bg-rose-400'
  if (s >= 60) return 'bg-amber-400'
  if (s >= 40) return 'bg-sky-400'
  return 'bg-white/30'
}

function contactName(c: ContactRow): string {
  return c.full_name || c.company || (c.email ? c.email.split('@')[0] : '—')
}

// Network is slow-thinking, one-venture-at-a-time work, so the deck remembers the
// last venture you triaged and opens locked onto it.
const VENTURE_LS_KEY = 'network.triage.venture'
function loadVenture(): string | null {
  try { return localStorage.getItem(VENTURE_LS_KEY) || null } catch { return null }
}
function persistVenture(v: string | null) {
  try { if (v) localStorage.setItem(VENTURE_LS_KEY, v); else localStorage.removeItem(VENTURE_LS_KEY) } catch { /* ignore */ }
}

// Horizontal venture filter chips, shared by the list and the swipe deck so you
// can re-scope the pile without leaving triage.
function VentureChips({ venture, onPick }: { venture: string | null; onPick: (slug: string | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
      <button
        onClick={() => onPick(null)}
        className={`px-3 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${venture === null ? 'btn-contrast' : 'bg-white/[0.06] text-white/70'}`}
      >
        All
      </button>
      {VENTURES.map(v => (
        <button
          key={v.slug}
          onClick={() => onPick(v.slug)}
          className={`px-3 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${venture === v.slug ? 'btn-contrast' : 'bg-white/[0.06] text-white/70'}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

// Card interior for a contact in the swipe deck (no action buttons — the swipe is
// the action). Carries the same "why is this worth my time?" signal as the
// LeadSheet so a right-swipe is an informed call, not a blind one.
function renderContactBody(c: ContactRow) {
  const fit = topFit(c.fit_scores)
  const why = contactRationale(c)   // best available: pass5 → pass4 → pass2 → pass1 → tags
  const move = dossierMove(c.dossier)
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 text-[12px] text-white/55 tabular-nums">
          <Flame size={12} className="text-rose-300" />{c.heat_score ?? 0}
        </span>
        {c.primary_venture && (
          <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] bg-white/[0.06] text-white/55">
            {ventureDisplayName(c.primary_venture)}
          </span>
        )}
        {c.consent_tier && (
          <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] bg-violet-500/10 text-violet-200">{c.consent_tier}</span>
        )}
        <SuggestedMoveChip contact={c} />
      </div>
      <p className="text-[20px] font-semibold text-white leading-snug">{contactName(c)}</p>
      {contactSubtitle(c) && (
        <p className="text-[14px] text-white/60 leading-relaxed mt-2">{contactSubtitle(c)}</p>
      )}

      {/* Why they're in your warm queue — the case for a right-swipe */}
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {fit && (
          <p className="text-[13px] text-amber-200/90 leading-relaxed inline-flex items-start gap-1.5">
            <Target size={13} className="mt-0.5 flex-shrink-0" />
            <span><span className="text-white/45">Best fit: </span>{ventureLabel(fit.venture)} · {fit.score}</span>
          </p>
        )}
        {why && (
          <p className="text-[13px] text-white/70 leading-relaxed mt-2">
            <Sparkles size={12} className="inline mr-1 text-violet-300" />
            <span className="text-white/40">{why.label}: </span>{why.text}
          </p>
        )}
        {move && (
          <p className="text-[13px] text-violet-200/85 leading-relaxed mt-2">
            <span className="text-white/40">The move: </span>{move}
          </p>
        )}
        {!why && !move && (
          <p className="text-[12.5px] text-white/45 leading-relaxed mt-2">
            Not researched yet — judge on heat {c.heat_score ?? 0}
            {fit ? `, ${ventureLabel(fit.venture)} fit ${fit.score}` : ''}
            {c.origin_campaign ? `, via ${c.origin_campaign}` : ''}. Tap to open → Research for the full angle.
          </p>
        )}
      </div>
    </>
  )
}

function contactSubtitle(c: ContactRow): string {
  return [c.title, c.company].filter(Boolean).join(' @ ')
}

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

/**
 * Mobile Relationship Engine "Leads". Lean: a pinned warm 1-by-1 list at top,
 * then a venture-filtered + searchable feed. Bulk actions are desktop-only;
 * here every row simply opens (no-op detail stub for now) so the phone stays a
 * quick-scan surface.
 */
export function MobileLeadsRE(_props: Props = {}) {
  const h = useHaptics()
  const { toast } = useToast()
  const [venture, setVentureState] = useState<string | null>(loadVenture)
  const setVenture = useCallback((v: string | null) => { setVentureState(v); persistVenture(v) }, [])
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)
  const [leadContact, setLeadContact] = useState<ContactRow | null>(null)

  const openLead = (c: ContactRow) => { h.select(); setLeadContact(c) }

  const openDraft = (c: ContactRow) => {
    setDraftTarget({
      id: c.id,
      name: contactName(c),
      subtitle: contactSubtitle(c) || ventureDisplayName(c.primary_venture),
      email: c.email,
      venture: c.primary_venture,
    })
  }

  const { contacts: rawContacts, loading } = useRealtimeContacts({
    ventureIn: venture ? [venture] : undefined,
    search: search || undefined,
  })
  const contacts = useMemo(() => rawContacts.filter(c => !isTestRecord(c)), [rawContacts])

  const { handQueue, feed } = useMemo(() => {
    const hand: ContactRow[] = []
    const rest: ContactRow[] = []
    for (const c of contacts) {
      if (isHandQueue(c)) hand.push(c)
      else rest.push(c)
    }
    const byScore = (a: ContactRow, b: ContactRow) => predictiveScore(b, venture) - predictiveScore(a, venture)
    hand.sort(byScore)
    rest.sort(byScore)
    return { handQueue: hand, feed: rest }
  }, [contacts, venture])

  const total = contacts.length

  // ── Swipe-triage over the warm 1-by-1 queue. Right = keep (+1), left = skip
  // (−1 → the contact is also suppressed from the warm queue server-side). Both
  // write a feedback_queue vote Vera's scout brief learns from.
  const onAccept = useCallback(async (c: ContactRow) => {
    const ok = await feedbackVote('contacts', c.id, 1, c.owner_agent)
    toast(ok ? 'Kept warm. Logged.' : 'Could not save — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])
  const onReject = useCallback(async (c: ContactRow, code?: string) => {
    const ok = await feedbackVote('contacts', c.id, -1, c.owner_agent, code)
    toast(ok ? 'Skipped. Vera will learn.' : 'Could not save — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])

  const triage = useSwipeTriage<ContactRow>({
    items: handQueue, getId: c => c.id, loading,
    onAccept, onReject,
  })

  // Deck-first landing: auto-enter the swipe deck once per mount when the warm
  // hand queue is non-empty. One-shot, so exiting back to the list sticks.
  const autoDeckRef = useRef(false)
  useEffect(() => {
    if (loading || autoDeckRef.current) return
    // Landing decision happens exactly once, on the first settled load; a
    // later realtime arrival must never yank the user into the deck mid-task.
    autoDeckRef.current = true
    if (handQueue.length > 0) triage.forceDeck()
  }, [loading, handQueue.length, triage])

  // First paint loads single-focus — one column shimmering in — not a blank flash.
  if (loading && rawContacts.length === 0) {
    return <MobileLoadingScreen title="Network" subtitle="Gathering your network…" />
  }

  if (triage.mode === 'deck') {
    const scope = venture ? ventureLabel(venture) : 'warm'
    return (
      <MobileStage scroll="none" header={<TabHeader title="Network" subtitle={`${handQueue.length} ${scope} · swipe to triage`} />}>
        <div className="px-4 pb-2 flex-shrink-0">
          <VentureChips venture={venture} onPick={(v) => { h.tap(); setVenture(v) }} />
        </div>
        <div className="flex-1 min-h-0 px-1">
          <SwipeDeck<ContactRow>
            deck={triage.deck}
            getId={c => c.id}
            renderBody={renderContactBody}
            ariaLabel={c => `Contact: ${contactName(c)}`}
            onAccept={triage.accept}
            onReject={triage.reject}
            onOpen={openLead}
            leftLabel="Skip"
            rightLabel="Keep"
            pending={triage.pending}
            reasonChips={() => reasonsFor('contacts')}
            onChooseReason={triage.chooseReason}
            onCancelPending={triage.cancelPending}
            remaining={triage.remaining}
            triagedCount={triage.triagedCount}
            onExit={triage.exitDeck}
            title="Handle 1-by-1"
            narrow
          />
        </div>
      </MobileStage>
    )
  }

  return (
    <MobileShell
      header={
        <TabHeader
          title="Network"
          subtitle={loading ? 'Loading…' : `${total} contacts`}
          trailing={
            <button
              onClick={() => { h.tap(); setShowImport(s => !s) }}
              className="px-5 py-3 rounded-full btn-contrast text-[15px] font-semibold active:scale-95 transition-transform"
            >
              Import
            </button>
          }
        />
      }
    >
      {showImport && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex-shrink-0">
          <ContactImportDropzone />
        </div>
      )}

      {/* Venture filter chips */}
      <div className="flex-shrink-0">
        <VentureChips venture={venture} onPick={(v) => { h.tap(); setVenture(v) }} />
      </div>

      {/* The single anti-confusion spine — top contact to reach out to now. */}
      {total > 0 && (
        <div className="flex-shrink-0">
          <NextNetworkHero contacts={contacts} venture={venture} onDraft={openDraft} narrow />
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, company, campaign…"
        className="flex-shrink-0 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:border-violet-400/40 focus:outline-none"
      />

      {total === 0 && !loading && (
        <EmptyState label="No contacts in this filter. Tap Import to add a list." />
      )}

      {/* Swipe-triage entry for the warm queue */}
      {handQueue.length > 0 && (
        <button
          type="button"
          onClick={() => { h.tap(); triage.forceDeck() }}
          className="w-full flex items-center gap-2.5 rounded-2xl border border-violet-400/30 bg-violet-500/10 active:bg-violet-500/20 p-3.5 text-left transition-colors"
        >
          <Layers size={18} className="text-violet-300 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-violet-100">Swipe to triage · {handQueue.length}</p>
            <p className="text-[11px] text-white/45">One card at a time — right keeps, left skips with a reason.</p>
          </div>
          <ChevronRight size={16} className="text-violet-300/70 ml-auto flex-shrink-0" />
        </button>
      )}

      {/* 1-by-1 warm list */}
      {handQueue.length > 0 && (
        <FeedCard title={`Handle 1-by-1 · ${handQueue.length}`}>
          {handQueue.slice(0, 20).map(c => (
            <FeedRow
              key={c.id}
              dotColor={heatDot(c.heat_score)}
              title={contactName(c)}
              detail={contactSubtitle(c) || ventureDisplayName(c.primary_venture)}
              trailing={
                <span className="flex items-center gap-1 text-[13px] text-white/45 tabular-nums">
                  <Flame size={12} className="text-rose-300" />
                  {c.heat_score ?? 0}
                </span>
              }
              onClick={() => openLead(c)}
              feedback={{ sourceTable: 'contacts', sourceId: c.id, agentId: c.owner_agent }}
            />
          ))}
        </FeedCard>
      )}

      {/* General feed */}
      {feed.length > 0 && (
        <FeedCard title={`Review · ${feed.length}`}>
          {feed.slice(0, 40).map(c => (
            <FeedRow
              key={c.id}
              dotColor={heatDot(c.heat_score)}
              title={contactName(c)}
              detail={contactSubtitle(c) || c.origin_campaign || undefined}
              trailing={<span className="text-[13px] text-white/40 tabular-nums">{humanAge(c.updated_at)}</span>}
              onClick={() => openLead(c)}
              feedback={{ sourceTable: 'contacts', sourceId: c.id, agentId: c.owner_agent }}
            />
          ))}
          {feed.length > 40 && (
            <div className="px-7 py-4 text-[14px] text-white/35 text-center">
              +{feed.length - 40} more — narrow with filters
            </div>
          )}
        </FeedCard>
      )}

      <LeadSheet
        contact={leadContact}
        onClose={() => setLeadContact(null)}
        onDraft={(c) => { setLeadContact(null); openDraft(c) }}
      />
      <OutreachDraftSheet target={draftTarget} onClose={() => setDraftTarget(null)} />
    </MobileShell>
  )
}
