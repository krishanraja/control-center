import { useMemo, useState } from 'react'
import { Mail, Sparkles, ArrowUpRight, Clock, CheckCircle2 } from 'lucide-react'
import type { LeadRow } from '../../hooks/useRealtimeLeads'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

// Pipeline's "Do this next" — same hero grammar as Content, tuned for Krish's
// outcome: CONTACT LEADS FAST. The ladder leads with the cheapest path to a real
// outreach and the action DOES the thing (draft the email / enrich to make it
// actionable), never just "open a deck".

type LeadActionKind = 'email' | 'enrich' | 'promote' | 'followup' | 'clear'

interface NextLead {
  kind: LeadActionKind
  lead?: LeadRow
  descriptor: HeroDescriptor
}

function leadName(l: LeadRow): string {
  return l.full_name || l.company || (l.email ? l.email.split('@')[0] : 'this lead')
}
function maxIcp(l: LeadRow): number {
  const s = l.icp_scores ? Object.values(l.icp_scores).map(Number).filter(Number.isFinite) : []
  return s.length ? Math.max(...s) : (l.icp_score ?? 0)
}
function clip(s: string, n = 48): string { return s.length > n ? `${s.slice(0, n)}…` : s }
function byFit(a: LeadRow, b: LeadRow): number { return (b.fit_score ?? maxIcp(b)) - (a.fit_score ?? maxIcp(a)) }

function computeNextLead(leads: LeadRow[]): NextLead {
  const active = leads
  // 1) Enriched + reachable + not yet emailed → draft the outreach (the contact action).
  const emailReady = active
    .filter(l => l.email && l.deep_enriched_at && !l.last_emailed_at && (l.status === 'ready' || l.status === 'new' || l.status === 'enriching'))
    .sort(byFit)
  if (emailReady[0]) {
    const l = emailReady[0]
    return {
      kind: 'email', lead: l,
      descriptor: {
        headline: `Draft email to ${clip(leadName(l))}`,
        sub: emailReady.length > 1 ? `${emailReady.length} enriched leads ready to contact` : [l.company, l.fit_score != null ? `fit ${l.fit_score}` : null].filter(Boolean).join(' · ') || 'Enriched and reachable',
        actionLabel: 'Draft email', icon: <Mail size={16} className="text-violet-300" />, tone: 'violet',
      },
    }
  }
  // 2) Un-enriched candidate → enrich it so it BECOMES actionable (the blocker).
  const candidates = active
    .filter(l => !l.deep_enriched_at && (l.status === 'new' || l.status === 'enriching'))
    .sort((a, b) => maxIcp(b) - maxIcp(a))
  if (candidates[0]) {
    const l = candidates[0]
    return {
      kind: 'enrich', lead: l,
      descriptor: {
        headline: `Enrich ${clip(leadName(l))}`,
        sub: candidates.length > 1 ? `${candidates.length} leads need enriching to be actionable · ~$0.50 each` : 'Not enriched yet — ~$0.50 to pull the full dossier',
        actionLabel: 'Enrich', icon: <Sparkles size={16} className="text-sky-300" />, tone: 'sky',
      },
    }
  }
  // 3) Enriched but no email on file → promote to a task so it doesn't stall.
  const promote = active
    .filter(l => l.deep_enriched_at && !l.email && l.status !== 'contacted' && l.status !== 'conversation' && !l.promoted_task_id)
    .sort(byFit)
  if (promote[0]) {
    const l = promote[0]
    return {
      kind: 'promote', lead: l,
      descriptor: {
        headline: `Promote ${clip(leadName(l))}`,
        sub: 'Enriched, no email on file — promote to an owned task', actionLabel: 'Promote',
        icon: <ArrowUpRight size={16} className="text-violet-300" />, tone: 'violet',
      },
    }
  }
  // 4) Follow-up that's due → re-contact.
  const now = Date.now()
  const followDue = active
    .filter(l => l.follow_up_at && !Number.isNaN(Date.parse(l.follow_up_at)) && new Date(l.follow_up_at).getTime() <= now && l.email)
    .sort((a, b) => (a.follow_up_at || '') < (b.follow_up_at || '') ? -1 : 1)
  if (followDue[0]) {
    const l = followDue[0]
    return {
      kind: 'followup', lead: l,
      descriptor: {
        headline: `Follow up with ${clip(leadName(l))}`,
        sub: 'Follow-up is due — draft the next touch', actionLabel: 'Draft email',
        icon: <Clock size={16} className="text-amber-300" />, tone: 'amber',
      },
    }
  }
  return {
    kind: 'clear',
    descriptor: { headline: "Pipeline's clear", sub: 'No leads waiting to be contacted or enriched. New leads land here.', icon: <CheckCircle2 size={16} className="text-emerald-400/80" />, tone: 'neutral', clear: true },
  }
}

export function NextLeadHero({ leads, narrow }: { leads: LeadRow[]; narrow?: boolean }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const next = useMemo(() => computeNextLead(leads), [leads])

  const post = async (url: string, body?: unknown, openFrom?: string) => {
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || String(r.status))
      h.success()
      if (openFrom && j?.[openFrom]) { try { window.open(j[openFrom], '_blank', 'noreferrer,noopener') } catch { /* popup blocked */ } }
      return true
    } catch (e: any) {
      h.error(); toast(`Could not complete — ${e?.message || 'try again'}`, 'error'); return false
    } finally { setBusy(false) }
  }

  const onAct = async () => {
    const l = next.lead
    if (!l) return
    switch (next.kind) {
      case 'email':
      case 'followup': {
        const ok = await post(`/api/leads/${l.id}/draft-email`, { intent: 'introduction' }, 'draft_url')
        if (ok) toast('Draft created in Gmail.', 'success')
        break
      }
      case 'enrich': {
        const ok = await post(`/api/leads/${l.id}/enrich`)
        if (ok) toast(`Enriching ${leadName(l)} · ~$0.50`, 'info')
        break
      }
      case 'promote': {
        const ok = await post('/api/leads/promote', { lead_id: l.id })
        if (ok) toast('Promoted to an active task.', 'success')
        break
      }
    }
  }

  return <DoThisNextHero descriptor={next.descriptor} onAct={onAct} busy={busy} narrow={narrow} />
}
