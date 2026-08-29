import { useMemo, useState } from 'react'
import { Mic, CheckCircle2, Megaphone, Clock, Send } from '@/lib/icons'
import type { GuestRow } from '../../hooks/useRealtimeGuests'
import type { VisibilityTargetRow } from '../../hooks/useVisibilityTargets'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

// Visibility's "Do this next" — ONE engine over inbound guests AND outbound
// stages (Krish: "both equally"). The ladder leads with the most time-sensitive,
// highest-value move and the action DOES the thing.

type VisKind = 'confirm' | 'apply_deadline' | 'pitch' | 'apply' | 'clear'

interface NextVis {
  kind: VisKind
  guest?: GuestRow
  target?: VisibilityTargetRow
  descriptor: HeroDescriptor
}

function clip(s: string, n = 46): string { return s.length > n ? `${s.slice(0, n)}…` : s }
function daysTo(iso?: string | null): number | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function computeNextVis(guests: GuestRow[], targets: VisibilityTargetRow[]): NextVis {
  // 1) A guest who replied / is scheduled → Confirm (fires the whole cascade).
  const toConfirm = guests
    .filter(g => g.status === 'responded' || g.status === 'scheduled')
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
  if (toConfirm[0]) {
    const g = toConfirm[0]
    return {
      kind: 'confirm', guest: g,
      descriptor: { headline: `Confirm ${clip(g.name)}`, sub: 'Replied / scheduled — confirm to fire prep + promo', actionLabel: 'Confirm', icon: <CheckCircle2 size={16} className="text-emerald-300" />, tone: 'emerald' },
    }
  }
  // 2) An outbound target with a deadline closing soon → Apply now (time-sensitive).
  const deadlineSoon = targets
    .filter(t => (t.status === 'sourced' || t.status === 'queued') && (daysTo(t.deadline_at) ?? 99) <= 14 && (daysTo(t.deadline_at) ?? -1) >= 0)
    .sort((a, b) => (daysTo(a.deadline_at) ?? 99) - (daysTo(b.deadline_at) ?? 99))
  if (deadlineSoon[0]) {
    const t = deadlineSoon[0]
    const d = daysTo(t.deadline_at)
    return {
      kind: 'apply_deadline', target: t,
      descriptor: { headline: `Apply to ${clip(t.title)}`, sub: d === 0 ? 'Closes today' : `Closes in ${d}d — get the application in`, actionLabel: 'Apply', icon: <Clock size={16} className="text-amber-300" />, tone: 'amber' },
    }
  }
  // 3) An enriched guest → Pitch (strong/green first).
  const toPitch = guests
    .filter(g => g.status === 'enriched' || g.status === 'scouted')
    .sort((a, b) => {
      const q = (g: GuestRow) => (g.quality_score === 'green' ? 2 : g.quality_score === 'amber' ? 1 : 0)
      if (q(b) !== q(a)) return q(b) - q(a)
      return (b.fit_score ?? 0) - (a.fit_score ?? 0)
    })
  if (toPitch[0]) {
    const g = toPitch[0]
    return {
      kind: 'pitch', guest: g,
      descriptor: { headline: `Pitch ${clip(g.name)}`, sub: toPitch.length > 1 ? `${toPitch.length} guests ready to pitch` : 'Enriched and ready for outreach', actionLabel: 'Pitch', icon: <Mic size={16} className="text-violet-300" />, tone: 'violet' },
    }
  }
  // 4) A queued outbound target → Apply (by relevance).
  const toApply = targets
    .filter(t => t.status === 'sourced' || t.status === 'queued')
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
  if (toApply[0]) {
    const t = toApply[0]
    return {
      kind: 'apply', target: t,
      descriptor: { headline: `Apply to ${clip(t.title)}`, sub: toApply.length > 1 ? `${toApply.length} stages / CFPs queued` : 'Queued visibility target', actionLabel: 'Apply', icon: <Megaphone size={16} className="text-violet-300" />, tone: 'violet' },
    }
  }
  return {
    kind: 'clear',
    descriptor: { headline: 'Visibility is clear', sub: 'No guests to confirm or pitch, no stages to apply to. New ones land here.', icon: <Send size={16} className="text-emerald-400/80" />, tone: 'neutral', clear: true },
  }
}

export function NextVisibilityHero({ guests, targets, narrow }: { guests: GuestRow[]; targets: VisibilityTargetRow[]; narrow?: boolean }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const next = useMemo(() => computeNextVis(guests, targets), [guests, targets])

  const req = async (url: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST') => {
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || String(r.status))
      h.success(); return true
    } catch (e: any) {
      h.error(); toast(`Could not complete — ${e?.message || 'try again'}`, 'error'); return false
    } finally { setBusy(false) }
  }

  const onAct = async () => {
    switch (next.kind) {
      case 'confirm':
        if (next.guest && await req('/api/guests/confirm', { guest_id: next.guest.id })) toast('Confirmed — cascade fired.', 'success')
        break
      case 'pitch':
        if (next.guest && await req(`/api/guests/${next.guest.id}`, { status: 'pitched' }, 'PATCH')) toast('Marked pitched.', 'success')
        break
      case 'apply':
      case 'apply_deadline':
        if (next.target && await req(`/api/visibility-targets/${next.target.id}/apply`)) toast('Marked applied.', 'success')
        break
    }
  }

  return <DoThisNextHero descriptor={next.descriptor} onAct={onAct} busy={busy} narrow={narrow} />
}
