import { useMemo } from 'react'
import { Zap, Eye, CheckCircle2 } from '@/lib/icons'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import type { ExternalSignal, SignalUrgency } from '../../hooks/useHomeIntelligence'

// Business Intelligence's "Do this next" — ONE algorithm for both shells.
//
// The tab used to run two: mobile ranked `home_intelligence.external_signals`
// by urgency and opened the top one; desktop ranked `zara_signals` by score
// and promoted straight to a bet. Same tab, two different "most important
// thing" answers depending on window width. This keeps the mobile behavior
// (Marcus's curated digest carries urgency + deadlines, and the signal sheet
// already offers both acts — task or bet — so opening IS the act-on-it path)
// and retires the desktop fork.

export type { ExternalSignal }

type IntelKind = 'open_critical' | 'open' | 'clear'

interface NextIntel {
  kind: IntelKind
  signal?: ExternalSignal
  descriptor: HeroDescriptor
}

function clip(s: string | null | undefined, n = 56): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

const URGENCY_RANK: Record<SignalUrgency, number> = { critical: 3, high: 2, medium: 1, low: 0 }

/** Most urgent first, sooner deadlines breaking ties — the one signal order. */
export function rankSignals(signals: ExternalSignal[]): ExternalSignal[] {
  return [...signals].sort((a, b) => {
    const u = (URGENCY_RANK[b.urgency || 'low'] ?? 0) - (URGENCY_RANK[a.urgency || 'low'] ?? 0)
    if (u !== 0) return u
    return (a.days_until ?? 99) - (b.days_until ?? 99)
  })
}

export function computeNextSignal(signals: ExternalSignal[]): NextIntel {
  const sorted = rankSignals(signals)
  const top = sorted[0]
  if (top && (top.urgency === 'critical' || top.urgency === 'high')) {
    const dayPart = (top.days_until != null && Number.isFinite(top.days_until))
      ? (top.days_until <= 0 ? 'past' : `${top.days_until}d`)
      : null
    return {
      kind: 'open_critical', signal: top,
      descriptor: {
        headline: `Open ${clip(top.signal)}`,
        sub: [top.urgency?.toUpperCase(), dayPart, top.relevance && clip(top.relevance, 32)].filter(Boolean).join(' · '),
        actionLabel: 'Open',
        icon: <Zap size={16} className="text-amber-300" />,
        tone: 'amber',
      },
    }
  }
  if (top) {
    return {
      kind: 'open', signal: top,
      descriptor: {
        headline: `Open ${clip(top.signal)}`,
        sub: top.relevance ? clip(top.relevance, 64) : 'Top signal — tap to review',
        actionLabel: 'Open',
        icon: <Eye size={16} className="text-violet-300" />,
        tone: 'violet',
      },
    }
  }
  return {
    kind: 'clear',
    descriptor: {
      headline: 'No fresh intelligence',
      sub: 'Marcus runs Mon/Wed/Fri — check back after the next sweep.',
      icon: <CheckCircle2 size={16} className="text-emerald-400/80" />,
      tone: 'neutral', clear: true,
    },
  }
}

interface Props {
  signals: ExternalSignal[]
  onOpen?: (signal: ExternalSignal) => void
  narrow?: boolean
}

export function NextSignalHero({ signals, onOpen, narrow }: Props) {
  const next = useMemo(() => computeNextSignal(signals), [signals])
  return (
    <DoThisNextHero
      descriptor={next.descriptor}
      onAct={() => next.signal && onOpen?.(next.signal)}
      narrow={narrow}
    />
  )
}
