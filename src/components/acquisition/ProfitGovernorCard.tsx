import { useState } from 'react'
import { CircleDollarSign, Pause, Play } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { laneAction, type LaneDetail } from '../../hooks/useLaneDetail'
import { BudgetBar } from './BudgetBar'

/**
 * Profit Governor — the lane's P&L with the hard gates visible:
 * contribution-margin headline, cost stack vs attributed MRR, CAC vs LTV,
 * budget burn (80% warn / 100% breaker), one-tap pause/resume, budget editor.
 * The gates themselves live in /api/acquisition/lanes/:slug — this card just
 * makes them legible.
 */
export function ProfitGovernorCard({
  detail,
  onChanged,
}: {
  detail: LaneDetail
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [daily, setDaily] = useState(String(detail.budget.daily_usd ?? 5))
  const [monthly, setMonthly] = useState(String(detail.budget.monthly_usd ?? 50))
  const [paid, setPaid] = useState(String(detail.budget.paid_monthly_usd ?? 0))

  const econ = detail.economics
  const margin = Number(econ?.contribution_margin_usd ?? 0)
  const positive = margin > 0

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      const { status, body } = await laneAction(detail.lane, payload)
      if (status >= 400) throw new Error(body?.error || `HTTP ${status}`)
      toast(okMsg, 'success')
      onChanged?.()
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const costRows: Array<[string, number]> = econ
    ? [
        ['Agent runs', Number(econ.agent_cost_mtd || 0)],
        ['API calls', Number(econ.api_cost_mtd || 0)],
        ['Subscriptions', Number(econ.fixed_cost_monthly || 0)],
        ['Ad spend', Number(econ.ad_spend_monthly || 0)],
      ]
    : []
  const maxCost = Math.max(1, ...costRows.map(([, v]) => v), Number(econ?.attributed_mrr || 0))

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <CircleDollarSign size={13} className={positive ? 'text-emerald-400' : 'text-rose-400'} />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Profit governor
        </h2>
        <span className={`ml-auto text-[13px] font-semibold tabular-nums ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
          {positive ? '+' : ''}${margin.toFixed(2)}/mo
        </span>
      </header>

      {detail.paused && (
        <div className="px-4 py-2.5 border-b border-white/[0.04] bg-rose-500/[0.06] flex items-center gap-2">
          <Pause size={12} className="text-rose-300" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-rose-300 font-medium">
              Lane paused by {detail.paused.by === 'governor' ? 'the budget breaker' : 'you'}
            </p>
            <p className="text-[10px] text-white/40 truncate">{detail.paused.reason}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ action: 'resume', acknowledge_overage: true }, 'Lane resumed.')}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <Play size={10} /> Resume
          </button>
        </div>
      )}

      <div className="px-4 py-3 space-y-2.5">
        {econ ? (
          <>
            {/* Cost stack vs revenue */}
            <div className="space-y-1.5">
              <div>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[10.5px] text-emerald-300/80">Attributed MRR</span>
                  <span className="text-[10.5px] tabular-nums text-emerald-300">${Number(econ.attributed_mrr).toFixed(2)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${(Number(econ.attributed_mrr) / maxCost) * 100}%` }} />
                </div>
              </div>
              {costRows.map(([label, v]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className="text-[10.5px] text-white/40">{label}</span>
                    <span className="text-[10.5px] tabular-nums text-white/55">${v.toFixed(2)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full bg-white/25" style={{ width: `${(v / maxCost) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-baseline gap-4 pt-1 text-[10.5px] text-white/40 tabular-nums">
              <span>CAC {econ.cac_usd != null ? `$${Number(econ.cac_usd).toFixed(0)}` : '—'}</span>
              <span>LTV est. {econ.ltv_estimate_usd != null ? `$${Number(econ.ltv_estimate_usd).toFixed(0)}` : '—'}</span>
              <span>{econ.new_paid_mtd} new paid MTD</span>
            </div>
          </>
        ) : (
          <p className="text-[11.5px] text-white/35">No economics yet for this lane.</p>
        )}

        <BudgetBar
          label="Monthly budget burn"
          spent={Number(econ?.total_cost_mtd || 0)}
          cap={Number(detail.budget.monthly_usd || 0)}
        />

        {/* Controls */}
        <div className="flex items-center gap-2 pt-1">
          {!detail.paused && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act({ action: 'pause', reason: 'manual pause from Growth tab' }, 'Lane paused — workflows deactivated.')}
              className="rounded-lg border border-rose-400/25 px-2.5 py-1 text-[11px] font-medium text-rose-300/80 hover:text-rose-300 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <Pause size={10} /> Pause lane
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(e => !e)}
            className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white transition-colors"
          >
            {editing ? 'Close' : 'Edit budget'}
          </button>
        </div>

        {editing && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
            {([
              ['Daily cap ($)', daily, setDaily],
              ['Monthly cap ($)', monthly, setMonthly],
              ['Paid/ads monthly ($)', paid, setPaid],
            ] as const).map(([label, val, set]) => (
              <label key={label} className="flex items-center justify-between gap-3 text-[11px] text-white/50">
                {label}
                <input
                  type="number"
                  min="0"
                  value={val}
                  onChange={e => set(e.target.value)}
                  className="w-24 rounded-md bg-white/[0.05] border border-white/[0.1] px-2 py-1 text-right text-white/85 text-[11.5px] tabular-nums focus:outline-none focus:border-violet-400/50"
                />
              </label>
            ))}
            <p className="text-[10px] text-white/30">
              Paid budget stays $0 until this lane has attributed revenue (Gate 4);
              all lanes' paid budgets are capped at ${detail.paid_global_cap_usd} total.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(
                  {
                    action: 'set_budget',
                    daily_usd: Number(daily),
                    monthly_usd: Number(monthly),
                    paid_monthly_usd: Number(paid),
                  },
                  'Budget saved.',
                ).then(() => setEditing(false))
              }
              className="rounded-lg bg-violet-500/15 border border-violet-400/30 px-3 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-40"
            >
              Save budget
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
