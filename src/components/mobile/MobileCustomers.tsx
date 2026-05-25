import React, { useMemo, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState } from './primitives'
import { DetailSheet } from './DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import {
  useCustomers, PRODUCT_LABEL, PRODUCT_ACCENT, KIND_LABEL, KIND_ACCENT,
  type CustomerRow, type CustomerProduct,
} from '../../hooks/useCustomers'
import { MrrTicker } from '../MrrTicker'
import { CustomerCouncilCard } from '../CustomerCouncilCard'
import { ExpansionRadar } from '../ExpansionRadar'
import { CustomerSourcesPanel } from '../CustomerSourcesPanel'

export function MobileCustomers() {
  const h = useHaptics()
  const { toast } = useToast()
  const { customers, buckets, totals, loading, error } = useCustomers()
  const [openId, setOpenId] = useState<string | null>(null)

  // Hero priority: newest paid customer in the last 7 days (celebration)
  // → newest churn in last 7 days (alert) → null.
  const hero = useMemo(() => {
    const now = Date.now()
    const within7d = (iso?: string | null) => iso && now - new Date(iso).getTime() < 7 * 86_400_000
    const recentPaid = customers
      .filter(c => c.kind === 'paid' && within7d(c.became_paid_at || c.created_at))
      .sort((a, b) => new Date(b.became_paid_at || b.created_at).getTime() - new Date(a.became_paid_at || a.created_at).getTime())[0]
    if (recentPaid) return { row: recentPaid, mode: 'paid' as const }
    const recentChurn = customers
      .filter(c => c.kind === 'churned' && within7d(c.churned_at))
      .sort((a, b) => new Date(b.churned_at!).getTime() - new Date(a.churned_at!).getTime())[0]
    if (recentChurn) return { row: recentChurn, mode: 'churned' as const }
    return null
  }, [customers])

  const open = openId ? customers.find(c => c.id === openId) ?? null : null

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Customers"
          subtitle={
            loading
              ? 'Loading…'
              : totals.paid > 0
                ? `${totals.paid} paid · $${Math.round(totals.mrrUsd).toLocaleString()}/mo`
                : 'No paid customers yet — sweep + Stripe webhooks not wired.'
          }
        />
      }
    >
      <MrrTicker variant="mobile" />
      <CustomerCouncilCard />
      <ExpansionRadar />
      <CustomerSourcesPanel />
      {hero && (
        <HeroCard
          eyebrow={hero.mode === 'paid' ? 'New paid customer' : 'Recent churn'}
          accent={hero.mode === 'paid' ? 'emerald' : 'red'}
          dotColor={hero.mode === 'paid' ? 'bg-emerald-400' : 'bg-red-400'}
          title={hero.row.full_name || hero.row.email || 'Customer'}
          detail={[PRODUCT_LABEL[hero.row.product], hero.row.plan].filter(Boolean).join(' · ')}
          meta={
            hero.mode === 'paid' && typeof hero.row.mrr_usd === 'number' && hero.row.mrr_usd > 0
              ? `$${Math.round(hero.row.mrr_usd)}/mo added`
              : hero.mode === 'churned'
                ? 'Investigate — Marcus can pull last-7-day context'
                : undefined
          }
          cta="Open"
          onClick={() => { h.select(); setOpenId(hero.row.id) }}
        />
      )}

      <div className="flex gap-3 flex-shrink-0">
        <StatPill label="Paid"     value={totals.paid}                color={totals.paid > 0 ? 'text-emerald-300' : 'text-white/45'} />
        <StatPill label="MRR / mo" value={`$${Math.round(totals.mrrUsd).toLocaleString()}`} color={totals.mrrUsd > 0 ? 'text-emerald-300' : 'text-white/45'} />
        <StatPill label="Signups"  value={totals.freeSignups}         color={totals.freeSignups > 0 ? 'text-violet-300' : 'text-white/45'} />
        <StatPill label="Waitlist" value={totals.waitlist}            color={totals.waitlist > 0 ? 'text-amber-300' : 'text-white/45'} />
      </div>

      {error && (
        <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 text-[16px] text-red-200">
          {error}
        </div>
      )}

      {customers.length === 0 && !loading && !error && (
        <EmptyState label="No customers yet. Apply the customers migration and activate the Maya sweeper." />
      )}

      {buckets
        .filter(b => b.total > 0)
        .sort((a, b) => b.paid - a.paid || b.total - a.total)
        .map(b => (
          <FeedCard
            key={b.product}
            title={`${PRODUCT_LABEL[b.product]} · ${b.total}`}
          >
            <div className="px-7 pt-3 pb-2 flex items-center gap-4 text-[14px]">
              {b.paid > 0 && (
                <span className="text-emerald-300 tabular-nums">
                  {b.paid} paid
                </span>
              )}
              {b.mrrUsd > 0 && (
                <span className="text-emerald-300 tabular-nums">
                  ${Math.round(b.mrrUsd).toLocaleString()}/mo
                </span>
              )}
              {b.freeSignups > 0 && (
                <span className="text-violet-300 tabular-nums">{b.freeSignups} free</span>
              )}
              {b.waitlist > 0 && (
                <span className="text-amber-300 tabular-nums">{b.waitlist} waitlist</span>
              )}
              {b.churned > 0 && (
                <span className="text-red-300 tabular-nums">{b.churned} churn</span>
              )}
            </div>
            {b.recent.map(c => (
              <FeedRow
                key={c.id}
                dotColor={KIND_ACCENT[c.kind]}
                title={c.full_name || c.email || 'Customer'}
                detail={[KIND_LABEL[c.kind], c.plan].filter(Boolean).join(' · ')}
                trailing={
                  typeof c.mrr_usd === 'number' && c.mrr_usd > 0 ? (
                    <span className="text-[14px] tabular-nums text-emerald-300">
                      ${Math.round(c.mrr_usd)}
                    </span>
                  ) : null
                }
                onClick={() => { h.select(); setOpenId(c.id) }}
              />
            ))}
          </FeedCard>
        ))}

      <DetailSheet
        open={open != null}
        onClose={() => setOpenId(null)}
        eyebrow={open ? `${PRODUCT_LABEL[open.product]} · ${KIND_LABEL[open.kind]}` : undefined}
        title={open?.full_name || open?.email || ''}
        body={
          open
            ? [
                open.email ? `Email: ${open.email}` : null,
                open.plan ? `Plan: ${open.plan}` : null,
                typeof open.mrr_usd === 'number' && open.mrr_usd > 0
                  ? `MRR: $${Math.round(open.mrr_usd)}/mo`
                  : null,
                open.source ? `Source: ${open.source}` : null,
                open.signed_up_at ? `Signed up: ${new Date(open.signed_up_at).toLocaleDateString()}` : null,
                open.became_paid_at ? `Became paid: ${new Date(open.became_paid_at).toLocaleDateString()}` : null,
                open.churned_at ? `Churned: ${new Date(open.churned_at).toLocaleDateString()}` : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        docUrl={open?.stripe_customer_id
          ? `https://dashboard.stripe.com/customers/${open.stripe_customer_id}`
          : undefined}
        actions={open && open.email ? [
          {
            label: 'Draft email',
            variant: 'primary',
            onClick: async () => {
              h.heavy()
              try {
                const r = await fetch(`/api/customers/${open.id}/draft-email`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ intent: 'check_in' }),
                })
                const body = await r.json().catch(() => ({}))
                if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
                h.success()
                toast('Draft created in Gmail.', 'success')
                if (body?.draft_url) {
                  try { window.open(body.draft_url, '_blank', 'noreferrer,noopener') } catch {}
                }
              } catch (e: any) {
                h.error()
                toast(`Could not draft email: ${e?.message || 'try again'}`, 'error')
              }
            },
          },
        ] : []}
      />
    </MobileShellPrim>
  )
}
