import { useMemo, useState } from 'react'
import { RefreshCw } from '@/lib/icons'
import { useAcquisition, type AcquisitionLane } from '../../hooks/useAcquisition'
import { useLaneDetail } from '../../hooks/useLaneDetail'
import { AUTONOMY_CHIP, laneDot, laneDotTitle } from '../acquisition/laneMeta'
import { ProfitGovernorCard } from '../acquisition/ProfitGovernorCard'
import { AutonomyLadderCard } from '../acquisition/AutonomyLadderCard'
import { DirectionStudio } from '../acquisition/DirectionStudio'
import { IntegrationsPanel } from '../acquisition/IntegrationsPanel'
import { ChurnReengagementQueue } from '../acquisition/ChurnReengagementQueue'
import { EmptyNote, SectionHead } from './atoms'
import { Working } from '../shared/Working'

/**
 * E) GOVERNANCE: the per-lane control plane. What growth costs, how much rope
 * the agents have, what they are allowed to say, and which tools are wired.
 *
 * One lane selector serves the whole section, because everything in it is keyed
 * on the acquisition lane slug (mm_ctrl, fractionl_circle, legibility and friends),
 * a different key space from the growth product_slug the Map, Work, Signals and
 * Council sections use. Two selectors in one tab would have been the defect, so
 * the lane-keyed cards all live here together.
 *
 * Reads go through the service-role routes (/api/acquisition/overview and
 * /api/acquisition/lanes/:slug): money, budgets and rejection rates are never
 * read on the anon client.
 *
 * BudgetBar is not rendered separately here. It is the burn bar INSIDE the
 * profit governor, driven by the lane's real total_cost_mtd against its real
 * monthly cap. There is no second cost feed to hang another one off, and a
 * duplicate bar over the same number would be noise.
 *
 * NOT rendered, and deliberately so: SendApprovalDeck, ReplyInbox,
 * SequenceReviewSheet, NurtureFunnelPanel and TouchProgressPanel. They serve
 * cold email outbound, which is retired by standing doctrine, and all three of
 * their tables (acquisition_sends, acquisition_replies, acquisition_sequences)
 * hold zero rows and stay that way. The files are untouched on disk, so reviving
 * the motion is an import away.
 */
export function GovernancePanel({
  variant,
  lane: laneParam,
  onSelectLane,
}: {
  variant: 'desktop' | 'mobile'
  lane?: string | null
  onSelectLane?: (slug: string) => void
}) {
  const { data, loading, error, refresh } = useAcquisition()
  const [pickedSlug, setPickedSlug] = useState<string | null>(laneParam || null)
  const [refreshing, setRefreshing] = useState(false)

  const lanes = data?.lanes || []
  // Wired and active lanes first, parked lanes trail.
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
  const selectedSlug = pickedSlug || laneParam || null
  const selected: AcquisitionLane | null =
    orderedLanes.find(l => l.slug === selectedSlug) || orderedLanes[0] || null
  const { detail, refresh: refreshDetail } = useLaneDetail(selected?.slug || null)

  const selectLane = (slug: string) => {
    setPickedSlug(slug)
    onSelectLane?.(slug)
  }

  const doRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  const changed = () => { refresh(); refreshDetail() }
  const twoUp = variant === 'desktop'

  if (loading && !data) {
    return <div className="text-white/40 text-sm py-10 text-center">Reading the control plane...</div>
  }

  return (
    <div className="space-y-4 pb-8">
      <SectionHead
        title="Governance"
        sub="What this lane costs, how much freedom its agents have, and what they are allowed to say. Every number comes straight from the live system."
        action={
          <button
            type="button"
            onClick={doRefresh}
            disabled={refreshing}
            title="Refresh"
            className="text-white/35 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            {refreshing ? <Working size={14} /> : <RefreshCw size={14} />}
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-label text-red-200">
          {error}
        </div>
      )}

      {orderedLanes.length === 0 ? (
        !error && (
          <EmptyNote>
            No product lanes registered, so there is nothing to govern yet. Lanes come from venture_registry;
            add a product venture there and its economics, autonomy level and direction lock appear here.
          </EmptyNote>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {orderedLanes.map(l => {
              const isSelected = selected?.slug === l.slug
              return (
                <button
                  key={l.slug}
                  type="button"
                  onClick={() => selectLane(l.slug)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-label transition-colors ${
                    isSelected
                      ? 'border-violet-400/50 bg-violet-500/15 text-white'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white/85 hover:border-white/20'
                  } ${!l.active ? 'opacity-50' : ''}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${laneDot(l)}`} title={laneDotTitle(l)} />
                  <span className="font-medium">{l.name}</span>
                  <span className={`rounded-full border px-1.5 text-micro font-semibold ${AUTONOMY_CHIP[l.autonomy_level]}`}>
                    {l.autonomy_level}
                  </span>
                  {l.mrr_usd > 0 && (
                    <span className="text-micro text-emerald-300 tabular-nums">
                      ${Math.round(l.mrr_usd).toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {selected && (
            <>
              <div className={twoUp ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start' : 'space-y-4'}>
                <div className="space-y-4 min-w-0">
                  {detail ? (
                    <ProfitGovernorCard detail={detail} onChanged={refreshDetail} />
                  ) : (
                    <p className="text-label text-white/35">Reading this lane's economics...</p>
                  )}
                  <AutonomyLadderCard lane={selected} detail={detail} onChanged={changed} />
                </div>
                <div className="space-y-4 min-w-0">
                  <DirectionStudio lane={selected.slug} detail={detail} onChanged={changed} />
                  <IntegrationsPanel integrations={data?.integrations || []} lane={selected.slug} />
                </div>
              </div>

              {/* Churn win-backs cost nothing while the queue is empty, and
                  leads.status='churned' is empty today, so this stays invisible
                  until Stripe actually cancels someone. It surfaces itself
                  rather than occupying a permanently empty card. */}
              {selected.churn_queue.length > 0 && (
                <ChurnReengagementQueue rows={selected.churn_queue} laneLabel={selected.name} />
              )}
              {(data?.unassigned_churn.length || 0) > 0 && (
                <ChurnReengagementQueue rows={data!.unassigned_churn} laneLabel="unassigned" />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
