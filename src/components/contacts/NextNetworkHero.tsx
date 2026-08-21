import { useMemo } from 'react'
import { Send, CheckCircle2 } from '@/lib/icons'
import type { ContactRow } from '../../hooks/useRealtimeContacts'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { predictiveScore, scoreRationale, isContactable } from '../../lib/networkScore'
import { useHaptics } from '../../hooks/useHaptics'

// Network's "Do this next" — surfaces the single highest predicted-priority
// contact to reach out to now (scoped to the active venture if one is filtered),
// with the score + why, and a one-tap "Draft email". Same hero as every tab.

function contactName(c: ContactRow): string {
  return c.full_name || c.company || (c.email ? c.email.split('@')[0] : 'this contact')
}
function clip(s: string, n = 40): string { return s.length > n ? `${s.slice(0, n)}…` : s }

export function NextNetworkHero({
  contacts, venture, onDraft, narrow,
}: {
  contacts: ContactRow[]
  venture?: string | null
  onDraft: (c: ContactRow) => void
  narrow?: boolean
}) {
  const h = useHaptics()
  const top = useMemo(() => {
    const ranked = contacts
      .filter(isContactable)
      .map(c => ({ c, score: predictiveScore(c, venture) }))
      .sort((a, b) => b.score - a.score)
    return ranked[0] || null
  }, [contacts, venture])

  if (!top) {
    return (
      <DoThisNextHero
        descriptor={{
          headline: 'Network is clear',
          sub: 'No reachable contacts to action in this filter. Adjust filters or import more.',
          icon: <CheckCircle2 size={16} className="text-emerald-400/80" />, tone: 'neutral', clear: true,
        }}
      />
    )
  }

  const { c, score } = top
  const vlabel = venture ? venture.replace(/_/g, ' ') : null
  return (
    <DoThisNextHero
      descriptor={{
        headline: `Reach out to ${clip(contactName(c))}`,
        sub: `${score}/100 priority${vlabel ? ` for ${vlabel}` : ''} · ${scoreRationale(c, venture) || 'top of your list'}`,
        actionLabel: 'Draft email',
        icon: <Send size={16} className="text-violet-300" />,
        tone: 'violet',
      }}
      onAct={() => { h.tap(); onDraft(c) }}
      narrow={narrow}
    />
  )
}
