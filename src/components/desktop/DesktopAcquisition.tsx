import { useMemo, useState } from 'react'
import { RefreshCw, Rocket } from 'lucide-react'
import { useAcquisition, type AcquisitionLane } from '../../hooks/useAcquisition'
import { useLaneDetail } from '../../hooks/useLaneDetail'
import { AUTONOMY_CHIP, laneDot, laneDotTitle } from '../acquisition/laneMeta'
import { ProfitGovernorCard } from '../acquisition/ProfitGovernorCard'
import { NurtureFunnelPanel } from '../acquisition/NurtureFunnelPanel'
import { TouchProgressPanel } from '../acquisition/TouchProgressPanel'
import { ChurnReengagementQueue } from '../acquisition/ChurnReengagementQueue'
import { AutonomyLadderCard } from '../acquisition/AutonomyLadderCard'
import { SendApprovalDeck } from '../acquisition/SendApprovalDeck'
import { ReplyInbox } from '../acquisition/ReplyInbox'
import { ContentToCapturePanel } from '../acquisition/ContentToCapturePanel'
import { GeoCitationsPanel } from '../acquisition/GeoCitationsPanel'
import { DirectionStudio } from '../acquisition/DirectionStudio'
import { SequenceReviewSheet } from '../acquisition/SequenceReviewSheet'
import { BoardSkeleton } from '../shared/Skeleton'

/**
 * Growth — the acquisition command deck. Per-lane nurture funnel, touch
 * progress, send queue, autonomy ladder, and churn re-engagement, read
 * through the service-role overview route. Subscriptions stays the ambient
 * revenue watch; this tab is where acquisition gets acted on.
 */
export function DesktopAcquisition({
  lane: laneParam,
  sendId,
  seqId,
  onNavigate,
}: {
  lane?: string | null
  sendId?: string | null
  seqId?: string | null
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}) {
  const { data, loading, error, refresh } = useAcquisition()
  const [selectedSlug, setSelectedSlug] = useState<string | null>(laneParam || null)
  const [refreshing, setRefreshing] = useState(false)

  const lanes = data?.lanes || []
  // Wired + active lanes first, parked lanes trail.
  const orderedLanes = useMemo(
    () =>
      [...lanes].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          Number(b.wired) - Number(a.wired) ||
          b.mrr_usd - a.mrr_usd,
      ),
    [lanes],
  )
  const selected: AcquisitionLane | null =
    orderedLanes.find(l => l.slug === selectedSlug) || orderedLanes[0] || null
  const { detail, refresh: refreshDetail } = useLaneDetail(selected?.slug || null)

  const totals = useMemo(
    () => ({
      queued: lanes.reduce((s, l) => s + l.queued_count, 0),
      sent: lanes.reduce((s, l) => s + l.sent_count, 0),
      paid: lanes.reduce((s, l) => s + l.paid_count, 0),
      mrr: lanes.reduce((s, l) => s + l.mrr_usd, 0),
      churn: lanes.reduce((s, l) => s + l.churn_queue.length, 0) + (data?.unassigned_churn.length || 0),
    }),
    [lanes, data],
  )

  const selectLane = (slug: string) => {
    setSelectedSlug(slug)
    onNavigate?.('acquisition', { lane: slug })
  }

  const doRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  if (loading && !data) {
    return <BoardSkeleton lanes={3} cardsPerLane={2} />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight flex items-center gap-2">
            <Rocket size={22} className="text-violet-400" /> Growth
          </h1>
          <p className="text-xs md:text-[13px] text-white/50 mt-0.5">
            {`${totals.queued} sends queued · ${totals.sent} sent · ${totals.paid} paid ($${Math.round(totals.mrr).toLocaleString()}/mo) · ${totals.churn} in churn queue`}
          </p>
        </div>
        <button
          type="button"
          onClick={doRefresh}
          disabled={refreshing}
          title="Refresh"
          className="text-white/35 hover:text-white/70 transition-colors disabled:opacity-40 mt-1.5"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {/* Lane switcher */}
      <div className="flex flex-wrap gap-1.5">
        {orderedLanes.map(l => {
          const isSelected = selected?.slug === l.slug
          return (
            <button
              key={l.slug}
              type="button"
              onClick={() => selectLane(l.slug)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                isSelected
                  ? 'border-violet-400/50 bg-violet-500/15 text-white'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/85 hover:border-white/20'
              } ${!l.active ? 'opacity-50' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${laneDot(l)}`} title={laneDotTitle(l)} />
              <span className="font-medium">{l.name}</span>
              <span className={`rounded-full border px-1.5 text-[9px] font-semibold ${AUTONOMY_CHIP[l.autonomy_level]}`}>
                {l.autonomy_level}
              </span>
              {l.queued_count > 0 && (
                <span className="text-[10px] text-amber-300 tabular-nums">{l.queued_count}</span>
              )}
            </button>
          )
        })}
      </div>

      {selected ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <DirectionStudio lane={selected.slug} detail={detail} onChanged={() => { refresh(); refreshDetail() }} />
            <NurtureFunnelPanel lane={selected} />
            <TouchProgressPanel lane={selected} />
            <ContentToCapturePanel rows={data?.content_attribution || []} />
            <GeoCitationsPanel lane={selected.slug} />
          </div>
          <div className="space-y-4">
            <SendApprovalDeck
              lane={selected.slug}
              autonomyLevel={selected.autonomy_level}
              focusSendId={sendId}
              onChanged={() => { refresh(); refreshDetail() }}
            />
            {detail && <ProfitGovernorCard detail={detail} onChanged={refreshDetail} />}
            <AutonomyLadderCard lane={selected} detail={detail} onChanged={() => { refresh(); refreshDetail() }} />
            <ReplyInbox lane={selected.slug} onChanged={refresh} />
            <ChurnReengagementQueue rows={selected.churn_queue} laneLabel={selected.name} />
          </div>
        </div>
      ) : (
        !error && (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] px-4 py-8 text-center">
            <p className="text-[12px] text-white/45">
              No product lanes registered. Add product ventures to venture_registry to light this up.
            </p>
          </div>
        )
      )}

      {(data?.unassigned_churn.length || 0) > 0 && (
        <ChurnReengagementQueue rows={data!.unassigned_churn} laneLabel="unassigned" />
      )}

      {seqId && (
        <SequenceReviewSheet
          seqId={seqId}
          onClose={() => onNavigate?.('acquisition', selected ? { lane: selected.slug } : {})}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
