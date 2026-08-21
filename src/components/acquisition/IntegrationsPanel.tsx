import { Plug, Check, Clock, Lock } from 'lucide-react'
import type { IntegrationRow } from '../../hooks/useAcquisition'

/**
 * Integrations — every tool the control center connects to for this lane, its
 * cost, and (for gated ones) why it's locked. Costs already fold into the
 * Profit Governor's economics; this panel makes the connection map legible.
 * Org-shared tools (empty lanes) show on every lane.
 */

const STATUS_META: Record<IntegrationRow['status'], { tone: string; Icon: typeof Check; label: string }> = {
  wired: { tone: 'text-emerald-300', Icon: Check, label: 'Wired' },
  pending: { tone: 'text-amber-300', Icon: Clock, label: 'Pending' },
  gated: { tone: 'text-white/40', Icon: Lock, label: 'Gated' },
}

export function IntegrationsPanel({
  integrations,
  lane,
}: {
  integrations: IntegrationRow[]
  lane: string
}) {
  // Tools serving this lane: named in lanes[], or org-shared (empty lanes).
  const forLane = integrations.filter(i => i.lanes.length === 0 || i.lanes.includes(lane))
  const order: IntegrationRow['status'][] = ['wired', 'pending', 'gated']
  const grouped = order.map(s => ({ status: s, rows: forLane.filter(i => i.status === s) })).filter(g => g.rows.length)
  const laneMonthly = forLane
    .filter(i => i.status !== 'gated' && i.lanes.includes(lane))
    .reduce((sum, i) => sum + (Number(i.monthly_usd) || 0) / Math.max(i.lanes.length, 1), 0)

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Plug size={13} className="text-cyan-400" />
        <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45">
          Integrations
        </h2>
        <span className="ml-auto text-micro text-white/30 tabular-nums">
          {forLane.filter(i => i.status === 'wired').length} wired
          {laneMonthly > 0 ? ` · $${laneMonthly.toFixed(0)}/mo to this lane` : ' · $0 marginal'}
        </span>
      </header>

      {grouped.length === 0 ? (
        <div className="px-4 py-5 text-center text-label text-white/35">No integrations registered.</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {grouped.map(({ status, rows }) => {
            const meta = STATUS_META[status]
            return (
              <div key={status} className="px-4 py-2">
                <p className={`text-micro font-semibold uppercase tracking-[0.14em] mb-1 ${meta.tone}`}>
                  {meta.label} · {rows.length}
                </p>
                <div className="space-y-1">
                  {rows.map(i => {
                    const Icon = meta.Icon
                    return (
                      <div key={i.tool} className="flex items-baseline gap-2 text-label">
                        <Icon size={10} className={`${meta.tone} flex-shrink-0 translate-y-0.5`} />
                        <span className="text-white/80 font-medium flex-shrink-0">{i.tool}</span>
                        <span className="text-white/30 truncate">{i.gated_reason || i.job || i.category}</span>
                        <span className="ml-auto text-micro text-white/35 tabular-nums flex-shrink-0">
                          {i.monthly_usd > 0 ? `$${Number(i.monthly_usd).toFixed(0)}/mo` : i.usage_metered ? 'usage' : 'free'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
