import { ChevronRight, Filter } from '@/lib/icons'
import type { AcquisitionLane } from '../../hooks/useAcquisition'

/**
 * Nurture Funnel — weekly capture → paid movement for one lane, straight from
 * the OS `acquisition_capture_to_paid` view, plus the per-frame sent split so
 * A/B frames are visible the moment two frames coexist.
 */
export function NurtureFunnelPanel({ lane }: { lane: AcquisitionLane }) {
  const weeks = lane.funnel_weeks.slice(0, 8)
  const totals = weeks.reduce(
    (acc, w) => ({
      captures: acc.captures + (Number(w.captures) || 0),
      paid: acc.paid + (Number(w.paid_added) || 0),
      mrr: acc.mrr + (Number(w.mrr_added) || 0),
    }),
    { captures: 0, paid: 0, mrr: 0 },
  )

  // Frame A/B leaderboard: sent → paid conversion per frame_version (from the
  // frame_conversion view). Winners come back as frame_promotion proposals.
  const frames = [...(lane.frames || [])]
    .filter(f => f.sent > 0 || f.paid > 0)
    .sort((a, b) => b.paid - a.paid || b.sent - a.sent)

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Filter size={13} className="text-violet-400" />
        <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45">
          Nurture funnel
        </h2>
        <span className="ml-auto text-micro text-white/30 tabular-nums">
          {totals.captures} captured → {totals.paid} paid · 8w
        </span>
      </header>

      {weeks.length === 0 ? (
        <div className="px-4 py-6 text-center text-label text-white/35">
          No capture data yet for this lane — wire the capture surface and the
          weekly funnel appears here.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {weeks.map(w => {
            const week = w.week ? new Date(w.week) : null
            const label = week
              ? week.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : '—'
            return (
              <div key={String(w.week)} className="px-4 py-2.5 flex items-center gap-1.5 text-label tabular-nums">
                <span className="w-14 text-white/40">{label}</span>
                <span className="inline-flex items-baseline gap-1">
                  <span className="font-semibold text-white/85">{w.captures}</span>
                  <span className="text-white/30">captured</span>
                </span>
                <ChevronRight size={11} className="text-white/20" />
                <span className="inline-flex items-baseline gap-1">
                  <span className={`font-semibold ${Number(w.paid_added) > 0 ? 'text-emerald-300' : 'text-white/60'}`}>
                    {w.paid_added}
                  </span>
                  <span className="text-white/30">paid</span>
                </span>
                <span className="ml-auto flex items-baseline gap-2">
                  {Number(w.mrr_added) > 0 && (
                    <span className="text-emerald-300/90">+${Math.round(Number(w.mrr_added)).toLocaleString()}/mo</span>
                  )}
                  <span className="text-white/25">
                    {w.capture_to_paid_pct != null ? `${Number(w.capture_to_paid_pct).toFixed(1)}%` : '—'}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {frames.length > 0 && (
        <div className="border-t border-white/[0.06]">
          <p className="px-4 pt-2.5 pb-1 text-micro font-semibold uppercase tracking-[0.14em] text-white/35">
            Frame leaderboard
          </p>
          <div className="px-4 pb-3 divide-y divide-white/[0.03]">
            {frames.map(f => {
              const conv = f.leads_touched > 0 ? (f.paid / f.leads_touched) * 100 : null
              return (
                <div key={f.frame_version} className="py-1.5 flex items-baseline gap-2 text-micro tabular-nums">
                  <span className="text-white/70 truncate">{f.frame_version}</span>
                  <span className="ml-auto text-white/35">{f.sent} sent</span>
                  <span className="text-white/35">{f.leads_touched} leads</span>
                  <span className={f.paid > 0 ? 'text-emerald-300' : 'text-white/35'}>{f.paid} paid</span>
                  <span className="w-12 text-right text-white/25">
                    {conv != null ? `${conv.toFixed(1)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
