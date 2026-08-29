import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { UserMinus } from '@/lib/icons'
import { useToast } from '../shared/Toast'
import type { ChurnLeadRow } from '../../hooks/useAcquisition'

/**
 * Churn Re-engagement Queue — leads the audience invariant flagged as churned
 * (Stripe subscription.deleted → customers.kind='churned' → leads.status='churned').
 * "Draft win-back" reuses the existing lead draft-email route; the copy is a
 * product-brand re-engagement note (never the personal brand) that Krish
 * reviews before it goes out from the product mailbox.
 */
export function ChurnReengagementQueue({
  rows,
  laneLabel,
}: {
  rows: ChurnLeadRow[]
  laneLabel?: string
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const draftWinBack = async (l: ChurnLeadRow) => {
    if (busy) return
    setBusy(l.id)
    try {
      const r = await fetch(`/api/leads/${l.id}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'win_back',
          note: 'They subscribed and cancelled. Acknowledge they left, mention one thing that changed since, offer an easy return path. No promotional language. Write in the product voice and sign off as the product team — never a personal brand.',
        }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok || !json || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`)
      toast('Win-back draft created — review before sending.', 'success')
      if (json.draft_url) {
        try { window.open(json.draft_url, '_blank', 'noreferrer,noopener') } catch { /* blocked */ }
      }
    } catch (e: any) {
      toast(e?.message || 'Draft failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <UserMinus size={13} className="text-rose-400" />
        <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45">
          Churn re-engagement{laneLabel ? ` · ${laneLabel}` : ''}
        </h2>
        <span className="ml-auto text-micro text-white/30 tabular-nums">{rows.length}</span>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-label text-white/35">
          No churned subscribers waiting — the 14-day re-engagement window is clear.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.slice(0, 8).map(l => (
            <div key={l.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label font-medium text-white truncate">
                  {l.full_name || l.email || 'unnamed'}
                </span>
                {l.churned_at && (
                  <span className="text-micro text-rose-300/70 flex-shrink-0">
                    churned {formatDistanceToNow(new Date(l.churned_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                {l.email && <p className="text-micro text-white/40 truncate">{l.email}</p>}
                <span className="text-micro text-white/25 flex-shrink-0">
                  {l.last_emailed_at
                    ? `emailed ${formatDistanceToNow(new Date(l.last_emailed_at), { addSuffix: true })}`
                    : 'not re-contacted'}
                </span>
              </div>
              {l.email && (
                <button
                  type="button"
                  disabled={busy === l.id}
                  onClick={() => draftWinBack(l)}
                  className="mt-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1 text-micro font-medium text-white/60 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
                >
                  {busy === l.id ? 'Drafting…' : 'Draft win-back'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
