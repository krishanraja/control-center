import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Mic, Megaphone, Calendar, Layers, ChevronRight, Sparkles, Linkedin, Twitter, Globe, Mail, ExternalLink, FileText } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader, MobileLoadingScreen } from './primitives'
import { SkeletonList } from '../shared/Skeleton'
import { NextVisibilityHero } from '../guests/NextVisibilityHero'
import { BottomSheet } from './BottomSheet'
import { isTestRecord } from '../../lib/recordHygiene'
import { useRealtimeGuests, type GuestStatus, type GuestRow } from '../../hooks/useRealtimeGuests'
import { useVisibilityTargets, type VisibilityTargetRow, type VisibilityTargetStatus } from '../../hooks/useVisibilityTargets'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { GuestCard } from '../GuestCard'
import { VisibilityTargetCard } from '../VisibilityTargetCard'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'
import { SwipeDeck } from '../shared/SwipeDeck'
import { QuickLinkRow, type QuickLink } from '../shared/QuickLinkRow'
import { buildLookupLinks } from '../../lib/lookupLinks'
import { useSwipeTriage } from '../../hooks/useSwipeTriage'
import { reasonsFor } from '../../lib/triageReasons'
import { triagePromote, triageReject } from '../../lib/triageActions'

type Lane = 'inbound' | 'outbound'

// Recorded/published guests leave Visibility — they're promoted into the Network
// (contacts) as relationships, not opportunities. Active = still in the pitch funnel.
const ACTIVE_STATUSES: GuestStatus[] = ['scouted', 'enriched', 'pitched', 'responded', 'scheduled', 'confirmed']
const ACTIVE_VIS_STATUSES: VisibilityTargetStatus[] = ['sourced', 'queued', 'applied', 'accepted']

const STATUS_LABEL: Record<GuestStatus, string> = {
  scouted: 'Scouted',
  enriched: 'Enriched',
  pitched: 'Pitched',
  responded: 'Responded',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  recorded: 'Recorded',
  published: 'Published',
  dropped: 'Dropped',
  skipped: 'Skipped',
}

const VIS_STATUS_LABEL: Record<VisibilityTargetStatus, string> = {
  sourced: 'Sourced',
  queued: 'Queued',
  applied: 'Applied',
  accepted: 'Accepted',
  rejected: 'Rejected',
  done: 'Done',
  dropped: 'Dropped',
}

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  guestId?: string | null
  targetId?: string | null
  onClearDetail?: () => void
}

export function MobileGuests({ onNavigate, guestId, targetId, onClearDetail }: Props = {}) {
  const [lane, setLane] = useState<Lane>('inbound')
  // Backburner-buried rows stay off the mobile lanes; restore lives on desktop.
  const { guests, loading: guestsLoading } = useRealtimeGuests({ statusIn: ACTIVE_STATUSES, filter: g => !g.buried_at && !isTestRecord(g) })
  const { targets: allTargets, loading: targetsLoading } = useVisibilityTargets({ includeArchived: false })
  const targets = useMemo(() => allTargets.filter(t => !t.buried_at && !isTestRecord(t)), [allTargets])
  const h = useHaptics()
  const { toast } = useToast()
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'

  useEffect(() => {
    if (guestId) setLane('inbound')
    if (targetId) setLane('outbound')
  }, [guestId, targetId])

  const detailDecision = guestId
    ? `guest:${guestId}`
    : targetId
      ? `visibility:${targetId}`
      : null

  const groupedGuests = useMemo(() => groupGuests(guests), [guests])
  const groupedTargets = useMemo(() => groupTargets(targets), [targets])

  // ── Swipe-triage decks (one per lane). Items are the pre-decision rows: guests
  // still scouted/enriched (accept → pitched +1, drop → skipped −1), targets still
  // sourced/queued (accept → applied +1, drop → dropped −1). Every swipe writes a
  // feedback_queue vote Vera learns from.
  const guestDeckItems = useMemo(
    () => guests.filter(g => g.status === 'scouted' || g.status === 'enriched'),
    [guests],
  )
  const targetDeckItems = useMemo(
    () => targets.filter(t => t.status === 'sourced' || t.status === 'queued'),
    [targets],
  )

  const onAcceptGuest = useCallback(async (g: GuestRow) => {
    const ok = await triagePromote('guests', g.id, 'nell')
    toast(ok ? 'Pitched. Vera will learn.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])
  const onRejectGuest = useCallback(async (g: GuestRow, code?: string) => {
    const ok = await triageReject('guests', g.id, 'nell', code)
    toast(ok ? 'Skipped. Vera will learn.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])
  const onAcceptTarget = useCallback(async (t: VisibilityTargetRow) => {
    const ok = await triagePromote('visibility_targets', t.id, 'nova')
    toast(ok ? 'Applied. Vera will learn.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])
  const onRejectTarget = useCallback(async (t: VisibilityTargetRow, code?: string) => {
    const ok = await triageReject('visibility_targets', t.id, 'nova', code)
    toast(ok ? 'Passed. Vera will learn.' : 'Could not update — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])

  // Visibility piles are an order of magnitude smaller than Content/Network, so the
  // default enter>30 never fired (17 enriched guests sat in a list). Lower it so a
  // pile worth swiping (≥8) flips into the deck on its own.
  const guestTriage = useSwipeTriage<GuestRow>({
    items: guestDeckItems, getId: g => g.id, loading: guestsLoading,
    onAccept: onAcceptGuest, onReject: onRejectGuest,
    enterAt: 8, exitAt: 5,
  })
  const targetTriage = useSwipeTriage<VisibilityTargetRow>({
    items: targetDeckItems, getId: t => t.id, loading: targetsLoading,
    onAccept: onAcceptTarget, onReject: onRejectTarget,
    enterAt: 8, exitAt: 5,
  })

  const inboundCount = guests.length
  const outboundCount = targets.filter(t => t.status !== 'done' && t.status !== 'dropped').length

  // Per-lane next-action: scheduled guests awaiting confirmation (inbound),
  // queued targets closest to deadline (outbound). Matches DesktopGuests.
  const inboundDecision = useMemo(() => {
    const scheduled = guests.filter(g => g.status === 'scheduled')
    return scheduled.sort((a, b) => {
      const aSched = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity
      const bSched = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity
      return aSched - bSched
    })[0] || null
  }, [guests])
  const outboundDecision = useMemo(() => {
    const queued = targets.filter(t => t.status === 'queued')
    return queued.sort((a, b) => {
      const aDl = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity
      const bDl = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity
      return aDl - bDl
    })[0] || null
  }, [targets])
  const scheduledCount = guests.filter(g => g.status === 'scheduled').length
  const queuedCount = targets.filter(t => t.status === 'queued').length

  const openGuest = (id: string) => { h.select(); navigateDecision(onNavigate, 'guest', id) }
  const openTarget = (id: string) => { h.select(); navigateDecision(onNavigate, 'visibility', id) }

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the active
  // lane's list regroups into the 3 daily-target lanes via relevance_index.
  // Inbound keys off 'guests' (not yet pooled, so lanes may be empty until then),
  // outbound off 'visibility_targets' (already pooled by the calibrator).
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderGuestRow = (g: GuestRow) => <GuestCard guest={g} onOpen={openGuest} />
  const renderTargetRow = (t: VisibilityTargetRow) => <VisibilityTargetCard target={t} onOpen={openTarget} />

  const laneTabs = (
    <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.015] p-1">
      <LaneTab active={lane === 'inbound'} onClick={() => { h.select(); setLane('inbound') }}>
        <Mic size={11} className="inline mr-1" />People
      </LaneTab>
      <LaneTab active={lane === 'outbound'} onClick={() => { h.select(); setLane('outbound') }}>
        <Megaphone size={11} className="inline mr-1" />Events
      </LaneTab>
    </div>
  )

  // ── Deck mode: the active lane's swipe deck owns the screen (lane toggle stays
  // so you can flip inbound/outbound without leaving triage).
  const activeTriage = lane === 'inbound' ? guestTriage : targetTriage

  // First paint loads single-focus — one column shimmering in — not a blank flash.
  if ((guestsLoading || targetsLoading) && guests.length === 0 && allTargets.length === 0) {
    return <MobileLoadingScreen title="Visibility" subtitle="Gathering people and events…" />
  }

  if (activeTriage.mode === 'deck') {
    return (
      <MobileShell scroll="none" header={<TabHeader title="Visibility" subtitle="Swipe to clear the pile" />}>
        <div className="px-4 pb-3 flex-shrink-0">{laneTabs}</div>
        <div className="flex-1 min-h-0">
          {lane === 'inbound' ? (
            <SwipeDeck<GuestRow>
              deck={guestTriage.deck}
              getId={g => g.id}
              renderBody={renderGuestBody}
              ariaLabel={g => `Guest: ${g.name}`}
              onAccept={guestTriage.accept}
              onReject={guestTriage.reject}
              onOpen={g => openGuest(g.id)}
              leftLabel="Skip"
              rightLabel="Pitch"
              pending={guestTriage.pending}
              reasonChips={() => reasonsFor('guests')}
              onChooseReason={guestTriage.chooseReason}
              onCancelPending={guestTriage.cancelPending}
              remaining={guestTriage.remaining}
              triagedCount={guestTriage.triagedCount}
              onExit={guestTriage.exitDeck}
              title="Guests to triage"
              narrow
              paused={!!detailDecision}
            />
          ) : (
            <SwipeDeck<VisibilityTargetRow>
              deck={targetTriage.deck}
              getId={t => t.id}
              renderBody={renderTargetBody}
              ariaLabel={t => `Target: ${t.title}`}
              onAccept={targetTriage.accept}
              onReject={targetTriage.reject}
              onOpen={t => openTarget(t.id)}
              leftLabel="Pass"
              rightLabel="Apply"
              pending={targetTriage.pending}
              reasonChips={() => reasonsFor('visibility_targets')}
              onChooseReason={targetTriage.chooseReason}
              onCancelPending={targetTriage.cancelPending}
              remaining={targetTriage.remaining}
              triagedCount={targetTriage.triagedCount}
              onExit={targetTriage.exitDeck}
              title="Targets to triage"
              narrow
              paused={!!detailDecision}
            />
          )}
        </div>

        {/* Tap / Maximize / ↑ on a deck card opens the full detail here too — the
            list-mode sheet doesn't mount in deck mode, so without this, opening a
            card from the deck silently did nothing. */}
        <BottomSheet open={!!detailDecision} onClose={() => onClearDetail?.()}>
          {detailDecision && (
            <DecisionDetail decision={detailDecision} onClose={() => onClearDetail?.()} actionsEnabled />
          )}
        </BottomSheet>
      </MobileShell>
    )
  }

  return (
    <MobileShell
      header={<TabHeader title="Visibility" subtitle="People to interview + events to be at" />}
    >
      <div className="pb-6 space-y-4">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.015] p-1 self-start">
          <LaneTab active={lane === 'inbound'} onClick={() => { h.select(); setLane('inbound') }}>
            <Mic size={11} className="inline mr-1" />
            People <span className="ml-1.5 text-[10px] text-white/45 tabular-nums">{inboundCount}</span>
          </LaneTab>
          <LaneTab active={lane === 'outbound'} onClick={() => { h.select(); setLane('outbound') }}>
            <Megaphone size={11} className="inline mr-1" />
            Events <span className="ml-1.5 text-[10px] text-white/45 tabular-nums">{outboundCount}</span>
          </LaneTab>
        </div>

        {/* Krish: "the mobile experience is way too overwhelming and complex
            given I would be looking at inspiration and opportunities on a mobile
            and triaging mainly."
            Focus Mode is a second mode selector stacked under the lane tabs, so
            the phone opened with TWO mode decisions before any content. It is a
            power feature for a desk, not for the three jobs he actually does on
            a phone (look, spot, triage). Desktop keeps it. */}

        <NextVisibilityHero guests={guests} targets={targets} narrow />

        {lane === 'inbound' ? (
          <>
            {guestDeckItems.length > 0 && (
              <TriageEntry
                count={guestDeckItems.length}
                label="Swipe to triage guests"
                onClick={() => { h.tap(); guestTriage.forceDeck() }}
              />
            )}
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2 px-1 flex items-center gap-1">
                <Mic size={11} className="text-violet-300" />
                Import
              </h2>
              <GuestImportDropzone />
            </section>

            {guestsLoading && <SkeletonList rows={3} />}

            {!guestsLoading && guests.length === 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center">
                <p className="text-[12px] text-white/55">No active guests yet.</p>
                <p className="text-[11px] text-white/35 mt-1">Import a list or wait for Nell&rsquo;s next scout.</p>
              </div>
            )}

            {showFocus ? (
              <FocusLanes
                rows={guests}
                table="guests"
                keyOf={(r) => String(r.id)}
                renderItem={renderGuestRow}
                fallback={null}
                mutedLabel="Off focus"
              />
            ) : (
              ACTIVE_STATUSES.map(s => {
                const rows = groupedGuests[s] || []
                if (rows.length === 0) return null
                return (
                  <section key={s}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2 px-1">
                      {STATUS_LABEL[s]} <span className="text-white/30 tabular-nums">({rows.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {rows.slice(0, 8).map(g => (
                        <GuestCard
                          key={g.id}
                          guest={g}
                          onOpen={(id) => { h.select(); navigateDecision(onNavigate || (() => {}), 'guest', id) }}
                        />
                      ))}
                    </div>
                  </section>
                )
              })
            )}
          </>
        ) : (
          <>
            {targetDeckItems.length > 0 && (
              <TriageEntry
                count={targetDeckItems.length}
                label="Swipe to triage targets"
                onClick={() => { h.tap(); targetTriage.forceDeck() }}
              />
            )}
            {targetsLoading && <SkeletonList rows={3} />}

            {!targetsLoading && outboundCount === 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center">
                <p className="text-[12px] text-white/55">No events yet.</p>
                <p className="text-[11px] text-white/35 mt-1">Nova&rsquo;s sweeper will surface them.</p>
              </div>
            )}

            {showFocus ? (
              <FocusLanes
                rows={targets}
                table="visibility_targets"
                keyOf={(r) => String(r.id)}
                renderItem={renderTargetRow}
                fallback={null}
                mutedLabel="Off focus"
              />
            ) : (
              ACTIVE_VIS_STATUSES.map(s => {
                const rows = groupedTargets[s] || []
                if (rows.length === 0) return null
                return (
                  <section key={s}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2 px-1">
                      {VIS_STATUS_LABEL[s]} <span className="text-white/30 tabular-nums">({rows.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {rows.slice(0, 8).map(t => (
                        <VisibilityTargetCard
                          key={t.id}
                          target={t}
                          onOpen={(id) => { h.select(); navigateDecision(onNavigate || (() => {}), 'visibility', id) }}
                        />
                      ))}
                    </div>
                  </section>
                )
              })
            )}
          </>
        )}
      </div>

      <BottomSheet open={!!detailDecision} onClose={() => onClearDetail?.()}>
        {detailDecision && (
          <DecisionDetail decision={detailDecision} onClose={() => onClearDetail?.()} actionsEnabled />
        )}
      </BottomSheet>
    </MobileShell>
  )
}

// Shared "enter the swipe deck" button shown in list mode for each lane.
function TriageEntry({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-2xl border border-violet-400/30 bg-violet-500/10 active:bg-violet-500/20 p-3.5 text-left transition-colors"
    >
      <Layers size={18} className="text-violet-300 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-violet-100">{label} · {count}</p>
        <p className="text-[11px] text-white/45">One card at a time — right keeps, left drops with a reason.</p>
      </div>
      <ChevronRight size={16} className="text-violet-300/70 ml-auto flex-shrink-0" />
    </button>
  )
}

const GUEST_TARGET_LABEL: Record<GuestRow['podcast_target'], string> = {
  signal_noise: 'Signal & Noise', builder_economy: 'Builder Economy (retired)', either: 'Either show',
}

// Card interior for a guest in the swipe deck (no action buttons — the swipe is the action).
function renderGuestBody(g: GuestRow) {
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200">
          <Mic size={9} />{GUEST_TARGET_LABEL[g.podcast_target]}
        </span>
        {g.quality_score && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] ${
            g.quality_score === 'green' ? 'bg-emerald-500/10 text-emerald-300' :
            g.quality_score === 'amber' ? 'bg-amber-500/10 text-amber-300' : 'bg-rose-500/10 text-rose-300'}`}>
            {g.quality_score}
          </span>
        )}
        {typeof g.fit_score === 'number' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {g.fit_score}</span>
        )}
        {typeof g.attainability_score === 'number' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Reach {g.attainability_score}</span>
        )}
      </div>
      <p className="text-[19px] font-semibold text-white leading-snug">{g.name}</p>
      {g.one_liner && <p className="text-[13px] text-white/60 leading-relaxed mt-2">{g.one_liner}</p>}
      {g.why_fit && (
        <p className="text-[13px] text-white/65 leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
          <span className="text-white/35">Why: </span>{g.why_fit.slice(0, 300)}{g.why_fit.length > 300 ? '…' : ''}
        </p>
      )}
      <QuickLinkRow links={guestLinks(g)} />
    </>
  )
}

// Quick links for a guest card: real profile URLs when present, PLUS always-on
// LinkedIn/Google/YouTube lookups so a scouted guest with no stored URLs is still
// researchable ("hear them talk" before pitching). Real links win on label
// collision (a real LinkedIn URL suppresses the LinkedIn search).
function guestLinks(g: GuestRow): QuickLink[] {
  const real: QuickLink[] = []
  if (g.linkedin_url) real.push({ label: 'LinkedIn', href: g.linkedin_url, icon: <Linkedin size={11} /> })
  if (g.twitter_handle) real.push({ label: 'X', href: `https://x.com/${g.twitter_handle.replace(/^@/, '')}`, icon: <Twitter size={11} /> })
  if (g.personal_url) real.push({ label: 'Site', href: g.personal_url, icon: <Globe size={11} /> })
  if (g.email) real.push({ label: 'Email', href: `mailto:${g.email}`, icon: <Mail size={11} /> })
  const have = new Set(real.map(l => l.label))
  const lookups = buildLookupLinks(g.name).filter(l => !have.has(l.label))
  return [...real, ...lookups]
}

// Card interior for a visibility target in the swipe deck.
function renderTargetBody(t: VisibilityTargetRow) {
  const daysToDeadline = t.deadline_at
    ? Math.ceil((new Date(t.deadline_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] bg-violet-500/15 text-violet-200">{t.type.replace(/_/g, ' ')}</span>
        {typeof t.relevance_score === 'number' && t.relevance_score > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {t.relevance_score}</span>
        )}
        {daysToDeadline !== null && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
            daysToDeadline < 0 ? 'bg-rose-500/10 text-rose-300' :
            daysToDeadline <= 14 ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.06] text-white/55'}`}>
            {daysToDeadline < 0 ? `${Math.abs(daysToDeadline)}d ago` : daysToDeadline === 0 ? 'today' : `${daysToDeadline}d left`}
          </span>
        )}
      </div>
      <p className="text-[19px] font-semibold text-white leading-snug">{t.title}</p>
      {t.why_relevant && (
        <p className="text-[13px] text-white/65 leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
          <Sparkles size={11} className="inline mr-1 text-violet-300" />
          <span className="text-white/35">Why: </span>{t.why_relevant.slice(0, 280)}{t.why_relevant.length > 280 ? '…' : ''}
        </p>
      )}
      {t.suggested_talk_title && (
        <p className="text-[12px] text-white/80 leading-snug mt-2 flex-shrink-0">
          <span className="text-white/40">Pitch: </span><span className="italic">{t.suggested_talk_title}</span>
        </p>
      )}
      <QuickLinkRow links={targetLinks(t)} />
    </>
  )
}

// Quick outbound links for a target card — CFP / event / where it was sourced.
function targetLinks(t: VisibilityTargetRow): QuickLink[] {
  const links: QuickLink[] = []
  if (t.cfp_url) links.push({ label: 'CFP', href: t.cfp_url, icon: <FileText size={11} /> })
  if (t.event_url && t.event_url !== t.cfp_url) links.push({ label: 'Event', href: t.event_url, icon: <ExternalLink size={11} /> })
  if (t.source_url && t.source_url !== t.event_url && t.source_url !== t.cfp_url) {
    links.push({ label: 'Source', href: t.source_url, icon: <Globe size={11} /> })
  }
  return links
}

function LaneTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2.5 text-[12px] rounded-md transition-colors min-h-[44px] inline-flex items-center ${
        active
          ? 'bg-violet-500/20 border border-violet-400/40 text-violet-100'
          : 'border border-transparent text-white/60'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

// Best-worth-it first: weak (low-triage) guests sink to the bottom of each group.
function byTriageDesc(a: GuestRow, b: GuestRow): number {
  return (b.triage_score ?? -1) - (a.triage_score ?? -1)
}

function groupGuests(guests: GuestRow[]): Partial<Record<GuestStatus, GuestRow[]>> {
  const out: Partial<Record<GuestStatus, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.status] || (out[g.status] = [])
    arr.push(g)
  }
  for (const k of Object.keys(out) as GuestStatus[]) out[k]!.sort(byTriageDesc)
  return out
}

function groupTargets(targets: VisibilityTargetRow[]): Partial<Record<VisibilityTargetStatus, VisibilityTargetRow[]>> {
  const out: Partial<Record<VisibilityTargetStatus, VisibilityTargetRow[]>> = {}
  for (const t of targets) {
    const arr = out[t.status] || (out[t.status] = [])
    arr.push(t)
  }
  return out
}
