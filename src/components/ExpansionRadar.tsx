import React from 'react'
import { ArrowUpRight } from '@/lib/icons'
import { useCustomerContacts } from '../hooks/useCustomerContacts'
import { PRODUCT_LABEL } from '../hooks/useCustomers'

/**
 * Pillar 3 — Expansion Radar. Lists long-tenured paid customers on starter
 * plans / low MRR — prime candidates for an upsell conversation.
 */
export function ExpansionRadar() {
  const { expansionTargets, loading } = useCustomerContacts()

  if (loading) return null
  if (expansionTargets.length === 0) return null

  return (
    <section className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] overflow-hidden">
      <header className="px-4 py-3 border-b border-violet-500/[0.12] flex items-center gap-1.5">
        <ArrowUpRight size={12} className="text-violet-300" />
        <h3 className="text-label font-semibold text-white">Expansion radar</h3>
        <span className="text-micro text-violet-200/60 ml-auto">
          {expansionTargets.length} ready
        </span>
      </header>
      <ul className="divide-y divide-violet-500/[0.08]">
        {expansionTargets.map(c => {
          const paidDays = c.became_paid_at
            ? Math.floor((Date.now() - new Date(c.became_paid_at).getTime()) / 86_400_000)
            : 0
          return (
            <li key={c.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-white truncate">
                  {c.full_name || c.email || 'Customer'}
                </p>
                <p className="text-micro text-white/55 mt-0.5">
                  {PRODUCT_LABEL[c.product]} · {paidDays}d on plan
                  {c.plan ? ` · ${c.plan}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {typeof c.mrr_usd === 'number' && c.mrr_usd > 0 && (
                  <p className="text-label tabular-nums text-emerald-300">
                    ${Math.round(c.mrr_usd)}/mo
                  </p>
                )}
                <p className="text-micro text-violet-200/60 mt-0.5">
                  Ready for upsell
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
