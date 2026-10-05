import { useMemo, useState } from 'react'
import { Mail, Plug, RefreshCw, CheckCircle2 } from '@/lib/icons'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { useToast } from '../shared/Toast'
import { formatCommittedMrr } from '../../hooks/useRevenue'
import { subscriptionsMove, type SubscriptionsMoveKind } from '../../lib/surfaceMoves'
import type { SubscriptionsModel } from './useSubscriptionsModel'

/**
 * Subscriptions' one move, on the desk and the phone (rules in
 * src/lib/surfaceMoves.ts). It was a calm "watching the revenue" bar that only
 * ever had one thing to say; the tab then lost it in the one-screen rebuild
 * (#387) and the two things it could have led with, a check-in and the next
 * number to wire, sat side by side at the bottom of the screen with equal
 * weight. Now the board leads with one of them, and says why when asked.
 *
 * Still a watch (charter 2026-06-17): the writes here are a Stripe sync and a
 * Gmail DRAFT, never a send. Opening a product is the caller's.
 */
/** The move and the input it was decided from, so a caller can arrange the rest around it. */
export function useSubscriptionsMove(s: SubscriptionsModel) {
  const input = useMemo(() => ({
    checkIns: s.expansion.map(c => ({ id: c.id, name: c.full_name || c.email || 'a paying customer', mrrUsd: c.mrr_usd ?? null })),
    revenue: s.revenue ? { paying: s.revenue.active_subscriptions, committedLabel: formatCommittedMrr(s.revenue) } : null,
    ageHours: s.ageHours,
    behind: s.behind && !s.loading,
    gaps: s.gaps.map(g => ({ productLabel: g.product.label, venture: g.product.venture, tier: g.product.tier, label: g.label, gap: g.gap, fix: g.fix })),
    loading: s.loading,
  }), [s.expansion, s.revenue, s.ageHours, s.behind, s.gaps, s.loading])
  const move = useMemo(() => subscriptionsMove(input), [input])
  return { move, input }
}

export function SubscriptionsMoveHero({ s, narrow, onOpenProduct, onOpenCustomer }: {
  s: SubscriptionsModel
  narrow?: boolean
  onOpenProduct: (venture: string) => void
  /** Phone: open the customer's sheet (draft, log a call) instead of drafting from the bar. */
  onOpenCustomer?: (id: string) => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const { move, input } = useSubscriptionsMove(s)
  if (!move) return null

  const draft = async (id: string) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/customers/${id}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'check_in' }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
      toast('Draft is in Gmail. Nothing was sent.', 'success')
      if (body?.draft_url) { try { window.open(body.draft_url, '_blank', 'noreferrer,noopener') } catch { /* popup blocked: the toast still says where it is */ } }
    } catch (e) {
      toast(`Could not draft the check-in: ${e instanceof Error ? e.message : 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const sync = async () => {
    setBusy(true)
    const err = await s.syncNow()
    setBusy(false)
    if (err) toast(`Stripe sync: ${err}`, 'error')
    else toast('Stripe synced. Revenue and subscribers are current.', 'success')
  }

  const act: Record<SubscriptionsMoveKind, (() => void) | undefined> = {
    check_in: () => {
      const id = input.checkIns[0]?.id
      if (!id) return
      if (onOpenCustomer) onOpenCustomer(id)
      else void draft(id)
    },
    sync: () => { void sync() },
    wire: () => { const v = input.gaps[0]?.venture; if (v) onOpenProduct(v) },
    clear: undefined,
  }
  const icon = move.kind === 'check_in' ? <Mail size={16} className="text-emerald-300" />
    : move.kind === 'sync' ? <RefreshCw size={16} className="text-amber-300" />
    : move.kind === 'wire' ? <Plug size={16} className="text-sky-300" />
    : <CheckCircle2 size={16} className="text-emerald-400/80" />

  return (
    <DoThisNextHero
      testId="subscriptions-move"
      stackAction={narrow}
      narrow={narrow}
      busy={busy || s.syncing}
      descriptor={{
        headline: move.headline,
        sub: move.sub,
        actionLabel: move.kind === 'check_in' && onOpenCustomer ? 'Open' : move.actionLabel,
        icon,
        tone: move.tone,
        clear: move.clear,
      }}
      onAct={act[move.kind]}
      why={move.why}
    />
  )
}
