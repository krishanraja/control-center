import { Plug, Check, Clock, Lock } from '@/lib/icons'
import type { IntegrationRow } from '../../hooks/useAcquisition'

/**
 * Connected tools: every tool the control center connects to for this lane,
 * its cost, and (for gated ones) why it is locked. Costs already fold into the
 * Profit Governor's economics; this panel makes the connection map legible.
 * Org-shared tools (empty lanes) show on every lane.
 *
 * Stacked rows (2026-09-08). The first version put the name, the job and the
 * price in one flex row with the job truncated, and the header's count and
 * cost on one line with a middle dot. On a phone the row squeezed the job to
 * three letters and an ellipsis and the header wrapped mid-number. Krish:
 * "all the connections are so misformatted". Now each tool is two lines:
 * name and price, then the job or the reason it is locked, in full.
 */

const STATUS_META: Record<IntegrationRow['status'], { tone: string; Icon: typeof Check; label: string; what: string }> = {
  wired: { tone: 'text-emerald-300', Icon: Check, label: 'Connected', what: 'working for this lane now' },
  pending: { tone: 'text-amber-300', Icon: Clock, label: 'Not yet', what: 'chosen, not connected' },
  gated: { tone: 'text-white/40', Icon: Lock, label: 'Locked', what: 'waits on a milestone' },
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
  const wired = forLane.filter(i => i.status === 'wired').length
  const laneMonthly = forLane
    .filter(i => i.status !== 'gated' && i.lanes.includes(lane))
    .reduce((sum, i) => sum + (Number(i.monthly_usd) || 0) / Math.max(i.lanes.length, 1), 0)

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.06] flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Plug size={13} className="text-cyan-400 flex-shrink-0" />
          <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45">
            Connected tools
          </h2>
        </div>
        <p className="text-label text-white/45 leading-snug tabular-nums">
          {wired} connected.{' '}
          {laneMonthly > 0 ? `About $${laneMonthly.toFixed(0)} a month of tool cost lands on this lane.` : 'No tool cost lands on this lane.'}
        </p>
      </header>

      {grouped.length === 0 ? (
        <div className="px-4 py-5 text-center text-label text-white/35">No tools registered for this lane.</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {grouped.map(({ status, rows }) => {
            const meta = STATUS_META[status]
            const Icon = meta.Icon
            return (
              <div key={status} className="px-4 py-3">
                <p className={`text-micro font-semibold uppercase tracking-[0.14em] mb-2 ${meta.tone}`}>
                  {meta.label} <span className="text-white/25 normal-case tracking-normal font-normal">{rows.length}, {meta.what}</span>
                </p>
                <ul className="flex flex-col gap-2.5">
                  {rows.map(i => (
                    <li key={i.tool} className="flex items-start gap-2.5 min-w-0">
                      <Icon size={11} className={`${meta.tone} flex-shrink-0 mt-[3px]`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-label text-white/85 font-medium break-words">{i.tool}</span>
                          <span className="text-micro text-white/40 tabular-nums flex-shrink-0">
                            {i.monthly_usd > 0 ? `$${Number(i.monthly_usd).toFixed(0)}/mo` : i.usage_metered ? 'pay per use' : 'free'}
                          </span>
                        </div>
                        {(i.gated_reason || i.job || i.category) && (
                          <p className="text-micro text-white/40 leading-snug break-words mt-0.5">
                            {i.status === 'gated' && i.gated_reason ? `Locked: ${i.gated_reason}` : (i.job || i.category)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
