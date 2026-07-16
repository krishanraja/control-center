import { formatDistanceToNow } from 'date-fns'
import { UserMinus } from 'lucide-react'
import type { ChurnLeadRow } from '../../hooks/useAcquisition'

/**
 * Churn Re-engagement Queue — leads the audience invariant flagged as churned
 * (Stripe subscription.deleted → customers.kind='churned' → leads.status='churned').
 * Read-only surface for now: the re-engagement sequence actions land with the
 * growth-loops phase; today this is the honest list of who left and when.
 */
export function ChurnReengagementQueue({
  rows,
  laneLabel,
}: {
  rows: ChurnLeadRow[]
  laneLabel?: string
}) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <UserMinus size={13} className="text-rose-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Churn re-engagement{laneLabel ? ` · ${laneLabel}` : ''}
        </h2>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">{rows.length}</span>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          No churned subscribers waiting — the 14-day re-engagement window is clear.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.slice(0, 8).map(l => (
            <div key={l.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-white truncate">
                  {l.full_name || l.email || 'unnamed'}
                </span>
                {l.churned_at && (
                  <span className="text-[10px] text-rose-300/70 flex-shrink-0">
                    churned {formatDistanceToNow(new Date(l.churned_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                {l.email && <p className="text-[10px] text-white/40 truncate">{l.email}</p>}
                <span className="text-[10px] text-white/25 flex-shrink-0">
                  {l.last_emailed_at
                    ? `emailed ${formatDistanceToNow(new Date(l.last_emailed_at), { addSuffix: true })}`
                    : 'not re-contacted'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
