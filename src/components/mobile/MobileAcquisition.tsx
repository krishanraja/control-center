import { useMemo, useState } from 'react'
import { MobileShell, TabHeader, StatPill, MobileLoadingScreen, EmptyState } from './primitives'
import { useAcquisition, type AcquisitionLane } from '../../hooks/useAcquisition'
import { AUTONOMY_CHIP, laneDot, laneDotTitle } from '../acquisition/laneMeta'
import { NurtureFunnelPanel } from '../acquisition/NurtureFunnelPanel'
import { TouchProgressPanel } from '../acquisition/TouchProgressPanel'
import { AutonomyLadderCard } from '../acquisition/AutonomyLadderCard'
import { SendQueuePreview } from '../acquisition/SendQueuePreview'
import { ChurnReengagementQueue } from '../acquisition/ChurnReengagementQueue'

/**
 * Growth (mobile) — single-column read of the acquisition command deck:
 * lane chips, headline stats, funnel, touch progress, queue, autonomy, churn.
 */
export function MobileAcquisition({
  onNavigate: _onNavigate,
}: {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}) {
  const { data, loading, error } = useAcquisition()
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const lanes = data?.lanes || []
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

  if (loading && !data) {
    return <MobileLoadingScreen title="Growth" subtitle="Reading the acquisition deck…" />
  }

  const totalQueued = lanes.reduce((s, l) => s + l.queued_count, 0)
  const totalPaid = lanes.reduce((s, l) => s + l.paid_count, 0)
  const totalMrr = lanes.reduce((s, l) => s + l.mrr_usd, 0)

  return (
    <MobileShell
      header={
        <TabHeader
          title="Growth"
          subtitle={
            error
              ? 'Temporarily unavailable'
              : `${totalQueued} queued · ${totalPaid} paid · $${Math.round(totalMrr).toLocaleString()}/mo`
          }
        />
      }
    >
      {error && (
        <div className="mx-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {orderedLanes.length === 0 && !error ? (
        <EmptyState label="No product lanes registered yet." />
      ) : (
        <>
          {/* Lane chips */}
          <div className="px-5 flex gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0">
            {orderedLanes.map(l => {
              const isSelected = selected?.slug === l.slug
              return (
                <button
                  key={l.slug}
                  type="button"
                  onClick={() => setSelectedSlug(l.slug)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'border-violet-400/50 bg-violet-500/15 text-white'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/60'
                  } ${!l.active ? 'opacity-50' : ''}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${laneDot(l)}`} title={laneDotTitle(l)} />
                  <span className="font-medium">{l.name}</span>
                  <span className={`rounded-full border px-1 text-[9px] font-semibold ${AUTONOMY_CHIP[l.autonomy_level]}`}>
                    {l.autonomy_level}
                  </span>
                </button>
              )
            })}
          </div>

          {selected && (
            <div className="px-5 space-y-4">
              <div className="flex gap-2">
                <StatPill label="Queued" value={selected.queued_count} color="text-amber-300" />
                <StatPill label="Sent" value={selected.sent_count} color="text-emerald-300" />
                <StatPill
                  label="MRR"
                  value={`$${Math.round(selected.mrr_usd).toLocaleString()}`}
                  color="text-emerald-300"
                  sub={`${selected.paid_count} paid`}
                />
              </div>
              <SendQueuePreview
                rows={(data?.queued_preview || []).filter(q => q.lane === selected.slug)}
                totalQueued={selected.queued_count}
              />
              <NurtureFunnelPanel lane={selected} />
              <TouchProgressPanel lane={selected} />
              <AutonomyLadderCard lane={selected} />
              <ChurnReengagementQueue rows={selected.churn_queue} laneLabel={selected.name} />
            </div>
          )}
        </>
      )}
    </MobileShell>
  )
}
