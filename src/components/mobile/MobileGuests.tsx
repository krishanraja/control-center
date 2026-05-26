import React, { useEffect, useMemo, useState } from 'react'
import { Mic, Megaphone } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './TabHeader'
import { BottomSheet } from './BottomSheet'
import { useRealtimeGuests, type GuestStatus, type GuestRow } from '../../hooks/useRealtimeGuests'
import { useVisibilityTargets, type VisibilityTargetRow, type VisibilityTargetStatus } from '../../hooks/useVisibilityTargets'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { GuestCard } from '../GuestCard'
import { VisibilityTargetCard } from '../VisibilityTargetCard'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'
import { useHaptics } from '../../hooks/useHaptics'

import { FeedbackButton } from '../shared/FeedbackButton'
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

  return (
    <MobileShell
      header={<TabHeader title="Visibility" subtitle="Inbound guests + outbound speaking" />}
    >
      <div className="px-3 pb-6 space-y-4">
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

            {ACTIVE_STATUSES.map(s => {
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
            })}
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

            {ACTIVE_VIS_STATUSES.map(s => {
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
            })}
          </>
        )}
      </div>

      <BottomSheet open={!!detailDecision} onClose={() => onClearDetail?.()}>
        {detailDecision && (
          <DecisionDetail decision={detailDecision} onClose={() => onClearDetail?.()} />
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
