import { useMemo } from 'react'
import { TrendingUp, Eye, Sparkles } from 'lucide-react'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import type { CustomerRow } from '../../hooks/useCustomers'

// Subscriptions' "Do this next" — Krish locked this as a READ-ONLY watch
// (CHARTER 2026-06-17: "watch revenue as it starts — read-only is fine").
// So the hero is calm: when Maya flags an expansion play we surface the top
// one (open to draft an email is one tap inside the detail sheet), and when
// nothing's waiting the hero stays in the shared "caught up" tone — no fake
// CTA, no forced action. The grammar still matches every other tab.

type SubscriptionsKind = 'expand' | 'watch'

interface NextSubscriptions {
  kind: SubscriptionsKind
  customer?: CustomerRow
  descriptor: HeroDescriptor
}

function clip(s: string | null | undefined, n = 38): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function nameOf(c: CustomerRow): string {
  return c.full_name || c.email || 'this account'
}

export function computeNextSubscriptions(
  expansionPlays: CustomerRow[],
  totals: { mrrUsd: number; paid: number },
): NextSubscriptions {
  const top = expansionPlays[0]
  const mrrLabel = `$${Math.round(totals.mrrUsd).toLocaleString()}/mo`
  if (top) {
    const detail = top.mrr_usd != null && top.mrr_usd > 0 ? `$${Math.round(top.mrr_usd)}/mo` : null
    return {
      kind: 'expand', customer: top,
      descriptor: {
        headline: `Reach out to ${clip(nameOf(top))}`,
        sub: expansionPlays.length > 1
          ? `${expansionPlays.length} expansion plays · top: ${detail || 'flagged for outreach'}`
          : `${detail ? `${detail} · ` : ''}Maya flagged for outreach`,
        actionLabel: 'Open',
        icon: <Sparkles size={16} className="text-emerald-300" />,
        tone: 'emerald',
      },
    }
  }
  return {
    kind: 'watch',
    descriptor: {
      headline: 'Watching the revenue',
      sub: `${mrrLabel} MRR · ${totals.paid} paid · no expansion plays waiting`,
      icon: <Eye size={16} className="text-emerald-400/70" />,
      tone: 'neutral', clear: true,
    },
  }
}

interface Props {
  expansionPlays: CustomerRow[]
  totals: { mrrUsd: number; paid: number }
  onOpen?: (customer: CustomerRow) => void
  narrow?: boolean
}

export function SubscriptionsWatchHero({ expansionPlays, totals, onOpen, narrow }: Props) {
  const next = useMemo(() => computeNextSubscriptions(expansionPlays, totals), [expansionPlays, totals])
  return (
    <DoThisNextHero
      descriptor={next.descriptor}
      onAct={() => next.customer && onOpen?.(next.customer)}
      narrow={narrow}
    />
  )
}
