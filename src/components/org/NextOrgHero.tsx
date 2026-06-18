import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import type { PendingCorrection } from '../../hooks/usePendingCorrections'

// Org's "Do this next" — Vera detects feedback patterns and proposes brief
// edits; the hero leads with the oldest unresolved correction so the agent
// roster keeps tightening without Krish hunting for the panel. Action behaviour
// is owned by the caller (desktop scrolls + outlines the row, mobile navigates
// to the desktop route) so the same hero serves both shells.

type OrgKind = 'review' | 'clear'

interface NextOrg {
  kind: OrgKind
  correction?: PendingCorrection
  descriptor: HeroDescriptor
}

function clip(s: string | null | undefined, n = 36): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export function computeNextOrg(corrections: PendingCorrection[], agentCount: number): NextOrg {
  const top = corrections[0]
  if (top) {
    const agentName = clip(top.agent_id, 24)
    const reason = top.pattern_reason_code ? clip(top.pattern_reason_code, 28) : null
    const downvotes = Array.isArray(top.consumed_feedback_ids) ? top.consumed_feedback_ids.length : 0
    return {
      kind: 'review', correction: top,
      descriptor: {
        headline: `Review Vera's edit for ${agentName}`,
        sub: corrections.length > 1
          ? `${corrections.length} pending corrections${reason ? ` · top: ${reason}` : ''}${downvotes ? ` · ${downvotes} downvotes` : ''}`
          : `${reason ? `${reason} · ` : ''}${downvotes ? `${downvotes} downvotes · ` : ''}approve to ship`,
        actionLabel: 'Review correction',
        icon: <AlertTriangle size={16} className="text-amber-300" />,
        tone: 'amber',
      },
    }
  }
  return {
    kind: 'clear',
    descriptor: {
      headline: 'Roster is tight',
      sub: `${agentCount} active agent${agentCount === 1 ? '' : 's'} · no correction patterns waiting`,
      icon: <CheckCircle2 size={16} className="text-emerald-400/80" />,
      tone: 'neutral', clear: true,
    },
  }
}

interface Props {
  corrections: PendingCorrection[]
  agentCount: number
  onReview?: (correction: PendingCorrection) => void
  narrow?: boolean
}

export function NextOrgHero({ corrections, agentCount, onReview, narrow }: Props) {
  const next = useMemo(() => computeNextOrg(corrections, agentCount), [corrections, agentCount])
  return (
    <DoThisNextHero
      descriptor={next.descriptor}
      onAct={() => next.correction && onReview?.(next.correction)}
      narrow={narrow}
    />
  )
}
