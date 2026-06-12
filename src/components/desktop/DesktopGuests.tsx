import React, { useEffect, useMemo, useState } from 'react'
import { Mic, Megaphone, Calendar } from 'lucide-react'
import { useRealtimeGuests, type GuestRow, type GuestStatus, type GuestPodcastTarget } from '../../hooks/useRealtimeGuests'
import { useVisibilityTargets, type VisibilityTargetRow, type VisibilityTargetStatus } from '../../hooks/useVisibilityTargets'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { VisibilityImportDropzone } from '../VisibilityImportDropzone'
import { GuestStatusLane } from './GuestStatusLane'
import { VisibilityTargetLane } from './VisibilityTargetLane'
import { DecisionDetail } from '../DecisionDetail'
import { NextActionStrip } from '../shared/NextActionStrip'
import { SlideOver } from '../shared/SlideOver'
import { BackburnerSection } from '../shared/BackburnerSection'
import { navigateDecision } from '../../lib/routeDecision'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'
import { GuestCard } from '../GuestCard'
import { VisibilityTargetCard } from '../VisibilityTargetCard'

type Lane = 'inbound' | 'outbound'

const PRIMARY_STATUSES: GuestStatus[] = ['scouted', 'enriched', 'pitched', 'responded', 'scheduled', 'confirmed', 'recorded', 'published', 'dropped']

const STATUS_META: Record<GuestStatus, { title: string; description: string }> = {
  scouted: { title: 'Scouted', description: 'Surfaced by Nell or imported, not yet enriched.' },
  enriched: { title: 'Enriched', description: 'Apollo-enriched, ready for outreach.' },
  pitched: { title: 'Pitched', description: 'Outreach sent, awaiting reply.' },
  responded: { title: 'Responded', description: 'Replied, awaiting scheduling.' },
  scheduled: { title: 'Scheduled', description: 'On the calendar. Confirm to fire the cascade.' },
  confirmed: { title: 'Confirmed', description: 'Cascade fired (prep, recording, promo drafts, email, follow-up).' },
  recorded: { title: 'Recorded', description: 'Episode in the can.' },
  published: { title: 'Published', description: 'Live in the feed.' },
  dropped: { title: 'Dropped', description: 'Not a fit, archived.' },
}

const TARGET_META: Record<GuestPodcastTarget, { title: string }> = {
  signal_noise: { title: 'Signal & Noise' },
  builder_economy: { title: 'Builder Economy' },
  either: { title: 'Either show' },
}

const VIS_STATUSES: VisibilityTargetStatus[] = ['sourced', 'queued', 'applied', 'accepted', 'rejected', 'done', 'dropped']

const VIS_STATUS_META: Record<VisibilityTargetStatus, { title: string; description: string }> = {
  sourced:  { title: 'Sourced',  description: 'Nova found it. Not yet deep-enriched or triaged.' },
  queued:   { title: 'Queued',   description: 'Enriched, awaiting Krish decision.' },
  applied:  { title: 'Applied',  description: 'Proposal or pitch submitted. Awaiting reply.' },
  accepted: { title: 'Accepted', description: 'In. Prep mode.' },
  rejected: { title: 'Rejected', description: 'No fit this round.' },
  done:     { title: 'Done',     description: 'Delivered.' },
  dropped:  { title: 'Dropped',  description: 'Not pursued.' },
}

interface Props {
  onOpenGuest?: (id: string) => void
  onOpenTarget?: (id: string) => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  guestId?: string | null
  targetId?: string | null
  onClearDetail?: () => void
}

export function DesktopGuests({ onOpenGuest, onOpenTarget, onNavigate, guestId, targetId, onClearDetail }: Props = {}) {
  const [lane, setLane] = useState<Lane>('inbound')
  const { guests: allGuests, loading: guestsLoading } = useRealtimeGuests()
  const { targets: allTargets, loading: targetsLoading } = useVisibilityTargets({ includeArchived: false })
  const guests = useMemo(() => allGuests.filter(g => !g.buried_at), [allGuests])
  const targets = useMemo(() => allTargets.filter(t => !t.buried_at), [allTargets])
  const buriedGuests = useMemo(() => allGuests.filter(g => g.buried_at), [allGuests])
  const buriedTargets = useMemo(() => allTargets.filter(t => t.buried_at), [allTargets])
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

  const byStatus = useMemo(() => groupByStatus(guests), [guests])
  const byTarget = useMemo(() => groupByTarget(guests), [guests])
  const inboundActive = guests.filter(g => g.status !== 'dropped' && g.status !== 'published').length

  const byVisStatus = useMemo(() => groupByVisStatus(targets), [targets])
  const outboundActive = targets.filter(t => t.status !== 'dropped' && t.status !== 'done').length

  const loading = lane === 'inbound' ? guestsLoading : targetsLoading
  const activeCount = lane === 'inbound' ? inboundActive : outboundActive

  const handleOpenGuest = onOpenGuest || ((id: string) => navigateDecision(onNavigate || (() => {}), 'guest', id))
  const openTarget = onOpenTarget || ((id: string) => navigateDecision(onNavigate || (() => {}), 'visibility', id))

  // Next action targets the most-urgent decision waiting.
  // Inbound: scheduled guests awaiting confirmation (the "RSVP" moment).
  // Outbound: queued visibility targets closest to deadline.
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

  const insightInbound = inboundDecision
    ? `${scheduledCount} scheduled · top: ${inboundDecision.name || inboundDecision.email || 'unnamed'}`
    : `${inboundActive} active · no scheduled guests awaiting confirmation`
  const insightOutbound = outboundDecision
    ? `${queuedCount} queued · top: ${outboundDecision.title}${outboundDecision.deadline_at ? ` (${daysUntil(outboundDecision.deadline_at)})` : ''}`
    : `${outboundActive} active · no queued opportunities awaiting decision`

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the active
  // lane's list regroups into the 3 daily-target lanes via relevance_index.
  // Inbound keys off 'guests' (not yet pooled, so lanes may be empty until then),
  // outbound off 'visibility_targets' (already pooled by the calibrator).
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderGuestRow = (g: GuestRow) => <GuestCard guest={g} onOpen={handleOpenGuest} />
  const renderTargetRow = (t: VisibilityTargetRow) => <VisibilityTargetCard target={t} onOpen={openTarget} />

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            {lane === 'inbound' ? <Mic size={20} className="text-violet-300" /> : <Megaphone size={20} className="text-violet-300" />}
            Visibility
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            Inbound podcast guests and outbound conference / CFP / newsletter appearances, side by side.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFocusModeEnabled() && calibrated && (
            <FocusModeToggle mode={mode} onChange={setMode} />
          )}
          <span className="text-[11px] text-white/55 tabular-nums">
            {loading ? '…' : `${activeCount} active`}
          </span>
        </div>
      </header>

      <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.015] p-1">
        <LaneTab active={lane === 'inbound'} onClick={() => setLane('inbound')}>
          Inbound <span className="ml-1.5 text-[10px] text-white/45 tabular-nums">{inboundActive}</span>
        </LaneTab>
        <LaneTab active={lane === 'outbound'} onClick={() => setLane('outbound')}>
          Outbound <span className="ml-1.5 text-[10px] text-white/45 tabular-nums">{outboundActive}</span>
        </LaneTab>
      </div>

      {lane === 'inbound' ? (
        <NextActionStrip
          headline={scheduledCount}
          headlineLabel="to confirm"
          insight={insightInbound}
          ctaLabel={inboundDecision ? 'Open guest' : 'View inbound'}
          onCta={() => inboundDecision && handleOpenGuest(inboundDecision.id)}
          icon={Calendar}
          accent={scheduledCount > 0 ? 'text-emerald-300' : 'text-violet-300'}
          disabled={!inboundDecision}
        />
      ) : (
        <NextActionStrip
          headline={queuedCount}
          headlineLabel="to decide"
          insight={insightOutbound}
          ctaLabel={outboundDecision ? 'Decide' : 'View outbound'}
          onCta={() => outboundDecision && openTarget(outboundDecision.id)}
          icon={Megaphone}
          accent={queuedCount > 0 ? 'text-amber-300' : 'text-violet-300'}
          disabled={!outboundDecision}
        />
      )}

      <SlideOver open={!!detailDecision} onClose={() => onClearDetail?.()}>
        {detailDecision && <DecisionDetail key={detailDecision} decision={detailDecision} actionsEnabled />}
      </SlideOver>

      {lane === 'inbound' ? (
        <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_2fr] gap-5">
          <aside className="space-y-4">
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                Import
              </h2>
              <GuestImportDropzone />
            </section>

            <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                By show
              </h2>
              <ul className="space-y-1">
                {(Object.keys(TARGET_META) as GuestPodcastTarget[]).map(t => {
                  const count = (byTarget[t] || []).length
                  return (
                    <li key={t} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                      <span className="text-white/75 truncate">{TARGET_META[t].title}</span>
                      <span className={`tabular-nums ${count > 0 ? 'text-white/85' : 'text-white/25'}`}>{count}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          </aside>

          <div className="space-y-3">
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
              PRIMARY_STATUSES.map(s => (
                <GuestStatusLane
                  key={s}
                  status={s}
                  title={STATUS_META[s].title}
                  description={STATUS_META[s].description}
                  guests={byStatus[s] || []}
                  onOpen={handleOpenGuest}
                />
              ))
            )}
            <BackburnerSection
              table="guests"
              items={buriedGuests.map(g => ({ id: g.id, title: g.name || '(unnamed)', buried_reason: g.buried_reason }))}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_2fr] gap-5">
          <aside className="space-y-4">
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                Import
              </h2>
              <VisibilityImportDropzone />
            </section>
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                By type
              </h2>
              <ul className="space-y-1">
                {(['cfp', 'conference', 'podcast', 'newsletter', 'guest_appearance', 'other'] as const).map(t => {
                  const count = targets.filter(x => x.type === t).length
                  return (
                    <li key={t} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                      <span className="text-white/75 truncate capitalize">{t.replace('_', ' ')}</span>
                      <span className={`tabular-nums ${count > 0 ? 'text-white/85' : 'text-white/25'}`}>{count}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
            <section className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/80 mb-2">
                Enrichment
              </h2>
              <p className="text-[12px] text-white/75 leading-snug">
                Nova fires deep enrichment on each sourced target twice daily. Each row gets strategic value, angle, proposed talk, audience snapshot, CFP requirements, and a prep checklist. Click any card to view the deep detail.
              </p>
            </section>
          </aside>

          <div className="space-y-3">
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
              VIS_STATUSES.map(s => (
                <VisibilityTargetLane
                  key={s}
                  status={s}
                  title={VIS_STATUS_META[s].title}
                  description={VIS_STATUS_META[s].description}
                  targets={byVisStatus[s] || []}
                  onOpen={openTarget}
                />
              ))
            )}
            <BackburnerSection
              table="visibility_targets"
              items={buriedTargets.map(t => ({ id: t.id, title: t.title || '(untitled)', buried_reason: t.buried_reason }))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function LaneTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
        active
          ? 'bg-violet-500/20 border border-violet-400/40 text-violet-100'
          : 'border border-transparent text-white/60 hover:text-white/85'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'today'
  return `${days}d`
}

function groupByStatus(guests: GuestRow[]): Partial<Record<GuestStatus, GuestRow[]>> {
  const out: Partial<Record<GuestStatus, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.status] || (out[g.status] = [])
    arr.push(g)
  }
  return out
}

function groupByTarget(guests: GuestRow[]): Partial<Record<GuestPodcastTarget, GuestRow[]>> {
  const out: Partial<Record<GuestPodcastTarget, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.podcast_target] || (out[g.podcast_target] = [])
    arr.push(g)
  }
  return out
}

function groupByVisStatus(targets: VisibilityTargetRow[]): Partial<Record<VisibilityTargetStatus, VisibilityTargetRow[]>> {
  const out: Partial<Record<VisibilityTargetStatus, VisibilityTargetRow[]>> = {}
  for (const t of targets) {
    const arr = out[t.status] || (out[t.status] = [])
    arr.push(t)
  }
  return out
}
