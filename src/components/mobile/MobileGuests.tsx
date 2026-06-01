import React, { useEffect, useMemo, useState } from 'react'
import { Mic, Megaphone, Calendar } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { NextActionStrip } from '../shared/NextActionStrip'
import { BottomSheet } from './BottomSheet'
import { useRealtimeGuests, type GuestStatus, type GuestRow } from '../../hooks/useRealtimeGuests'
import { useVisibilityTargets, type VisibilityTargetRow, type VisibilityTargetStatus } from '../../hooks/useVisibilityTargets'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { GuestCard } from '../GuestCard'
import { VisibilityTargetCard } from '../VisibilityTargetCard'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'
import { useHaptics } from '../../hooks/useHaptics'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

type Lane = 'inbound' | 'outbound'

const ACTIVE_STATUSES: GuestStatus[] = ['scouted', 'enriched', 'pitched', 'responded', 'scheduled', 'confirmed', 'recorded']
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
  const { guests, loading: guestsLoading } = useRealtimeGuests({ statusIn: ACTIVE_STATUSES })
  const { targets, loading: targetsLoading } = useVisibilityTargets({ includeArchived: false })
  const h = useHaptics()
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

  return (
    <MobileShell
      header={<TabHeader title="Visibility" subtitle="Inbound guests + outbound speaking" />}
    >
      <div className="pb-6 space-y-4">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.015] p-1 self-start">
          <LaneTab active={lane === 'inbound'} onClick={() => { h.select(); setLane('inbound') }}>
            <Mic size={11} className="inline mr-1" />
            Inbound <span className="ml-1.5 text-[10px] text-white/45 tabular-nums">{inboundCount}</span>
          </LaneTab>
          <LaneTab active={lane === 'outbound'} onClick={() => { h.select(); setLane('outbound') }}>
            <Megaphone size={11} className="inline mr-1" />
            Outbound <span className="ml-1.5 text-[10px] text-white/45 tabular-nums">{outboundCount}</span>
          </LaneTab>
        </div>

        {isFocusModeEnabled() && calibrated && (
          <div className="flex items-center justify-end -mt-1">
            <FocusModeToggle mode={mode} onChange={setMode} />
          </div>
        )}

        {lane === 'inbound' ? (
          <NextActionStrip
            headline={scheduledCount}
            headlineLabel="to confirm"
            insight={inboundDecision
              ? `${scheduledCount} scheduled · top: ${inboundDecision.name || inboundDecision.email || 'unnamed'}`
              : `${inboundCount} active · no scheduled guests awaiting confirmation`}
            ctaLabel={inboundDecision ? 'Open' : 'View inbound'}
            onCta={() => { if (inboundDecision) openGuest(inboundDecision.id) }}
            icon={Calendar}
            accent={scheduledCount > 0 ? 'text-emerald-300' : 'text-violet-300'}
            disabled={!inboundDecision}
          />
        ) : (
          <NextActionStrip
            headline={queuedCount}
            headlineLabel="to decide"
            insight={outboundDecision
              ? `${queuedCount} queued · top: ${outboundDecision.title}`
              : `${outboundCount} active · no queued opportunities awaiting decision`}
            ctaLabel={outboundDecision ? 'Decide' : 'View outbound'}
            onCta={() => { if (outboundDecision) openTarget(outboundDecision.id) }}
            icon={Megaphone}
            accent={queuedCount > 0 ? 'text-amber-300' : 'text-violet-300'}
            disabled={!outboundDecision}
          />
        )}

        {lane === 'inbound' ? (
          <>
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2 px-1 flex items-center gap-1">
                <Mic size={11} className="text-violet-300" />
                Import
              </h2>
              <GuestImportDropzone />
            </section>

            {guestsLoading && (
              <div className="text-[12px] text-white/45 text-center py-4">Loading…</div>
            )}

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
            {targetsLoading && (
              <div className="text-[12px] text-white/45 text-center py-4">Loading…</div>
            )}

            {!targetsLoading && outboundCount === 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center">
                <p className="text-[12px] text-white/55">No outbound opportunities yet.</p>
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

function groupGuests(guests: GuestRow[]): Partial<Record<GuestStatus, GuestRow[]>> {
  const out: Partial<Record<GuestStatus, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.status] || (out[g.status] = [])
    arr.push(g)
  }
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
