import { useMemo } from 'react'
import { Users } from '@/lib/icons'
import { formatDistanceToNow } from 'date-fns'
import {
  useCustomers, PRODUCT_LABEL, PRODUCT_CHIP_TONE,
  type CustomerRow, type CustomerProduct,
} from '../../hooks/useCustomers'
import { Skeleton } from '../shared/Skeleton'

/**
 * SubscribersList — the roster the watch-hero doesn't show. Subscriptions is
 * a deliberately read-only "watch" (Krish's charter, 2026-06-17); this adds
 * VISIBILITY only, no new actions. Every active (kind === 'paid', not
 * churned) subscriber across every product, newest became_paid_at first,
 * with enough detail (product, plan, MRR, when, and how we know the row is
 * trustworthy) that Krish never has to open Stripe to answer "who's paying
 * me right now?".
 *
 * Self-fetching (its own useCustomers() poll), same convention as the other
 * Customers-tab panels (CustomerSourcesPanel, ExpansionRadar) — drop it in
 * with no props, on both desktop and mobile.
 */

const WEBHOOK_CONFIDENCE = new Set(['exact_email', 'utm', 'unattributed'])

function displayName(c: CustomerRow): string {
  return c.full_name || c.email || 'Unknown'
}

function mrrLabel(c: CustomerRow): string {
  if (typeof c.mrr_usd === 'number' && c.mrr_usd > 0) {
    return `$${Math.round(c.mrr_usd).toLocaleString()}/mo`
  }
  if (c.mrr_usd === 0) return 'one-time'
  return ''
}

function signedUp(c: CustomerRow): { absolute: string; relative: string } | null {
  const iso = c.became_paid_at
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    absolute: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    relative: formatDistanceToNow(d, { addSuffix: true }),
  }
}

function chipTone(product: CustomerProduct): string {
  return PRODUCT_CHIP_TONE[product] || 'text-white/70 bg-white/[0.06] border-white/10'
}

function productLabel(product: CustomerProduct): string {
  return PRODUCT_LABEL[product] || product
}

export function SubscribersList() {
  const { customers, loading } = useCustomers()

  // Active subscriber = kind === 'paid'. Defensively also require no
  // churned_at, matching the same MRR-sum definition useCustomers already
  // uses elsewhere — a row shouldn't read "active" if it's mid-transition to
  // churned.
  const active = useMemo(() => {
    return customers
      .filter(c => c.kind === 'paid' && !c.churned_at)
      .sort((a, b) => {
        const at = a.became_paid_at ? new Date(a.became_paid_at).getTime() : 0
        const bt = b.became_paid_at ? new Date(b.became_paid_at).getTime() : 0
        return bt - at
      })
  }, [customers])

  const totalMrr = useMemo(
    () => active.reduce((sum, c) => sum + (typeof c.mrr_usd === 'number' ? c.mrr_usd : 0), 0),
    [active],
  )

  const byProduct = useMemo(() => {
    const counts = new Map<CustomerProduct, number>()
    for (const c of active) counts.set(c.product, (counts.get(c.product) || 0) + 1)
    return Array.from(counts.entries())
      .map(([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count)
  }, [active])

  const newest = active[0]
  const newestWhen = newest ? signedUp(newest) : null

  if (loading && customers.length === 0) {
    return (
      // flex-shrink-0: this section sits in the mobile shell's flex-col scroll
      // region alongside several other panels. Without it, a plain
      // overflow-hidden block is a valid flex-shrink target with an automatic
      // min-size of 0 (CSS Flexbox §"Automatic Minimum Size"), so once the
      // page's total content exceeds the viewport the flex algorithm can
      // squash this down to a visually clipped sliver instead of letting the
      // page scroll normally — same fix HeroCard/FeedCard already apply.
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden flex-shrink-0">
        <div className="px-4 py-3 space-y-2">
          <Skeleton h={10} w={128} r={4} />
          <Skeleton h={8} w={192} r={4} />
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden flex-shrink-0">
      <header className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-1.5">
        <Users size={12} className="text-white/45" />
        <h3 className="text-label font-semibold text-white">Subscribers</h3>
        <span className="text-micro text-white/40 ml-auto">Every active subscriber, newest first</span>
      </header>

      {active.length === 0 ? (
        <p className="px-4 py-8 text-center text-label text-white/45">
          No active subscribers yet. The capture lane is live.
        </p>
      ) : (
        <>
          {/* Summary strip */}
          <div className="px-4 py-3 border-b border-white/[0.05] flex flex-wrap items-start gap-x-5 gap-y-2">
            <div>
              <p className="text-micro uppercase tracking-[0.14em] text-white/35">Active MRR</p>
              <p className="text-ui font-semibold tabular-nums text-emerald-300">
                ${Math.round(totalMrr).toLocaleString()}/mo
              </p>
            </div>
            <div>
              <p className="text-micro uppercase tracking-[0.14em] text-white/35">Subscribers</p>
              <p className="text-ui font-semibold tabular-nums text-white">{active.length}</p>
            </div>
            {newest && (
              <div className="min-w-0">
                <p className="text-micro uppercase tracking-[0.14em] text-white/35">Newest</p>
                <p className="text-label text-white/70 truncate max-w-[220px]">
                  {displayName(newest)}
                  {newestWhen && <span className="text-white/40"> · {newestWhen.relative}</span>}
                </p>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap sm:ml-auto">
              {byProduct.map(({ product, count }) => (
                <span
                  key={product}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro font-medium ${chipTone(product)}`}
                >
                  {productLabel(product)}
                  <span className="tabular-nums opacity-70">{count}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Roster — internal scroll so a long list doesn't push the page,
              mirroring the app's existing bounded max-h + overflow-y-auto
              list pattern (e.g. DesktopLeadsRE / DesktopLeads). */}
          <ul className="divide-y divide-white/[0.05] max-h-[52vh] overflow-y-auto">
            {active.map(c => {
              const mrr = mrrLabel(c)
              const su = signedUp(c)
              const stripeVerified = c.attribution_confidence === 'reconciled'
              const webhookVerified = !stripeVerified
                && !!c.attribution_confidence
                && WEBHOOK_CONFIDENCE.has(c.attribution_confidence)
              const showInsight = !!c.attribution_channel || stripeVerified || webhookVerified

              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-white truncate">{displayName(c)}</p>
                      {c.email && c.full_name && <p className="text-micro text-white/45 truncate">{c.email}</p>}
                    </div>
                    {mrr && (
                      <span className="text-label tabular-nums text-emerald-300 flex-shrink-0">{mrr}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-micro font-medium flex-shrink-0 ${chipTone(c.product)}`}>
                      {productLabel(c.product)}
                    </span>
                    {c.plan && <span className="text-micro text-white/45 truncate">{c.plan}</span>}
                    {su && (
                      <span className="text-micro text-white/40 truncate" title={su.absolute}>
                        {su.absolute} · {su.relative}
                      </span>
                    )}
                  </div>

                  {showInsight && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {c.attribution_channel && (
                        <span className="text-micro text-white/40 truncate">via {c.attribution_channel}</span>
                      )}
                      {stripeVerified && (
                        <span className="inline-flex items-center rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-micro font-semibold uppercase tracking-[0.14em] text-emerald-300 flex-shrink-0">
                          Stripe-verified
                        </span>
                      )}
                      {webhookVerified && (
                        <span className="inline-flex items-center rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-micro font-medium text-white/50 flex-shrink-0">
                          Webhook
                        </span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
