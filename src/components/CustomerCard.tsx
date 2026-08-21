import React from 'react'
import { Mail, ExternalLink, DollarSign } from 'lucide-react'
import {
  PRODUCT_LABEL, PRODUCT_ACCENT, KIND_LABEL, KIND_ACCENT,
  type CustomerRow,
} from '../hooks/useCustomers'

interface Props {
  customer: CustomerRow
}

export function CustomerCard({ customer: c }: Props) {
  const name = c.full_name || (c.email ? c.email.split('@')[0] : 'Unnamed')
  const productLabel = PRODUCT_LABEL[c.product] || c.product
  const kindLabel    = KIND_LABEL[c.kind]
  const productDot   = PRODUCT_ACCENT[c.product]
  const kindDot      = KIND_ACCENT[c.kind]
  const when         = c.became_paid_at || c.signed_up_at || c.created_at
  const isChurned    = c.kind === 'churned'

  return (
    <article className={`rounded-xl border ${isChurned ? 'border-red-500/25 bg-red-500/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'} p-3 hover:border-white/[0.14] transition-colors`}>
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-body font-semibold text-white leading-snug truncate">{name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-micro text-white/55">
              <span className={`w-1.5 h-1.5 rounded-full ${productDot}`} />
              {productLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-micro text-white/55">
              <span className={`w-1.5 h-1.5 rounded-full ${kindDot}`} />
              {kindLabel}
            </span>
            {c.plan && (
              <span className="text-micro text-white/45 truncate">{c.plan}</span>
            )}
          </div>
        </div>
        {typeof c.mrr_usd === 'number' && c.mrr_usd > 0 && (
          <span className="text-micro tabular-nums text-emerald-300 flex-shrink-0">
            <DollarSign size={9} className="inline" />
            {Math.round(c.mrr_usd).toLocaleString()}/mo
          </span>
        )}
      </header>

      {(c.source || when) && (
        <div className="flex items-center justify-between gap-3 mt-2 text-micro text-white/40">
          <span className="truncate">{c.source ? `via ${c.source}` : ''}</span>
          <span className="tabular-nums flex-shrink-0">{when ? humanAgo(when) : ''}</span>
        </div>
      )}

      {(c.email || c.stripe_customer_id) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-medium border border-white/10 text-white/60 hover:bg-white/[0.06]"
            >
              <Mail size={10} />
              Email
            </a>
          )}
          {c.stripe_customer_id && (
            <a
              href={`https://dashboard.stripe.com/customers/${c.stripe_customer_id}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-medium border border-white/10 text-white/60 hover:bg-white/[0.06]"
            >
              <ExternalLink size={10} />
              Stripe
            </a>
          )}
        </div>
      )}
    </article>
  )
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
