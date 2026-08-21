import { AlertTriangle } from 'lucide-react'

/**
 * Budget burn bar — emerald under 75%, amber to 100%, rose at/over. The same
 * visual contract the old CostDashboard used; now the one shared money-bar.
 */
export function BudgetBar({
  label,
  spent,
  cap,
}: {
  label: string
  spent: number
  cap: number
}) {
  const pct = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0
  const over = cap > 0 && spent >= cap
  const warn = !over && cap > 0 && spent / cap >= 0.75
  const tone = over ? 'bg-rose-400' : warn ? 'bg-amber-400' : 'bg-emerald-400'
  const text = over ? 'text-rose-300' : warn ? 'text-amber-300' : 'text-white/45'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-micro text-white/40">{label}</span>
        <span className={`text-micro tabular-nums flex items-center gap-1 ${text}`}>
          {(over || warn) && <AlertTriangle size={10} />}
          ${spent.toFixed(2)} / ${cap.toFixed(0)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
