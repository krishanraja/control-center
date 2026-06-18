import { useMemo, useState } from 'react'
import { Zap, Target, Radio, CheckCircle2 } from 'lucide-react'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import { useToast } from '../shared/Toast'
import { supabase } from '../../lib/supabase'

// Intel's desktop "Do this next" — Zara surfaces market signals; the hero picks
// the highest-scored unactioned signal (≥8) and PROMOTES IT TO A BET in one tap
// (was: fake button that just scrolled and outlined — violated P-3 / "every
// button does what it says"). Falls back to a calm watch state when no hot
// signal is on the board.

export interface ZaraSignal {
  id: string
  signal_type: string | null
  venture: string | null
  company_name: string | null
  description: string | null
  source_url: string | null
  signal_score: number | null
  status: string | null
  surfaced_at: string | null
  summary: string | null
}

type IntelKind = 'promote' | 'tracked' | 'clear'

interface NextIntel {
  kind: IntelKind
  signal?: ZaraSignal
  descriptor: HeroDescriptor
}

function clip(s: string | null | undefined, n = 64): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export function computeNextIntel(signals: ZaraSignal[]): NextIntel {
  const hot = signals
    .filter(s => (s.signal_score ?? 0) >= 8 && (s.status === 'received' || s.status === null))
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))
  if (hot[0]) {
    const s = hot[0]
    const label = clip(s.description || s.summary || s.signal_type || s.company_name || 'this signal')
    return {
      kind: 'promote', signal: s,
      descriptor: {
        headline: `Promote ${label}`,
        sub: hot.length > 1
          ? `${hot.length} hot signals (score ≥ 8) — start with the top one (${s.signal_score})`
          : `Score ${s.signal_score}${s.venture ? ` · ${s.venture}` : ''} — turn it into a bet`,
        actionLabel: 'Promote to bet',
        icon: <Target size={16} className="text-amber-300" />,
        tone: 'amber',
      },
    }
  }
  if (signals.length > 0) {
    return {
      kind: 'tracked',
      descriptor: {
        headline: `${signals.length} signals tracked`,
        sub: 'Nothing scoring 8+ yet — keep watching, Zara sweeps Mon/Wed/Fri.',
        icon: <Radio size={16} className="text-violet-300" />,
        tone: 'neutral',
        clear: true,
      },
    }
  }
  return {
    kind: 'clear',
    descriptor: {
      headline: 'No fresh signals',
      sub: 'Zara will surface market signals on her next sweep.',
      icon: <CheckCircle2 size={16} className="text-emerald-400/80" />,
      tone: 'neutral', clear: true,
    },
  }
}

interface Props {
  signals: ZaraSignal[]
  onPromoted?: (signalId: string) => void
  narrow?: boolean
}

export function NextIntelDesktopHero({ signals, onPromoted, narrow }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const next = useMemo(() => computeNextIntel(signals), [signals])

  const onAct = async () => {
    const s = next.signal
    if (!s || busy) return
    setBusy(true)
    try {
      const hypothesis = (s.summary || s.description || `Act on ${s.signal_type || 'signal'}`).slice(0, 240)
      const r = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hypothesis,
          success_criterion: 'Define measurable outcome within the time-box.',
          kind: 'experiment',
          time_box_days: 14,
          agent_owner: 'krish',
          source_signal_id: s.id,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await supabase.from('zara_signals').update({ status: 'actioned' }).eq('id', s.id)
      onPromoted?.(s.id)
      toast('Promoted to bet. Open Bets to finalize the success criterion.', 'success')
    } catch (e: any) {
      toast(`Could not promote: ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return <DoThisNextHero descriptor={next.descriptor} onAct={onAct} busy={busy} narrow={narrow} />
}
