import React, { useEffect, useState, useCallback } from 'react'
import { MoreHorizontal, CheckCircle2 } from 'lucide-react'
import { useAgents } from '../hooks/useAgents'
import { MobileShell } from './mobile/MobileShell'
import { TabHeader } from './mobile/TabHeader'
import { Logomark } from './mobile/Logomark'
import { SynthesisLine } from './mobile/SynthesisLine'
import { BlockerCard, BlockerItem } from './mobile/BlockerCard'
import { DetailSheet, SheetAction } from './mobile/DetailSheet'
import { HealthStrip, HealthItem } from './mobile/HealthStrip'
import { TeamStrip } from './mobile/TeamStrip'
import { SkeletonCard } from './mobile/SkeletonLine'
import { useHaptics } from '../hooks/useHaptics'
import { ZaraIntelligence } from './ZaraIntelligence'

// ── Types ────────────────────────────────────────────────────────────────────
interface RawTask {
  id: string
  title: string
  description?: string
  agent?: string
  urgency?: string
  blockedBy?: string
  createdAt?: string
  actionUrl?: string
  actionLabel?: string
}

interface RawApproval {
  id: string
  agentName: string
  status: string
  planUrl?: string
  createdAt?: string
}

interface HomeIntel {
  executive_summary?: string
  generated_at?: string
  strategic_assessment?: { headline?: string; recommended_focus?: string }
}

interface SystemsData {
  categories?: { id: string; label: string; services: { id: string; name: string; status: string }[] }[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function agentPod(agentName: string | undefined, agents: { humanName: string; name: string; id: string; pod?: string }[]) {
  if (!agentName) return undefined
  const match = agents.find(a =>
    a.humanName.toLowerCase() === agentName.toLowerCase() ||
    a.name.toLowerCase() === agentName.toLowerCase() ||
    a.id === agentName
  )
  return match?.pod
}

function humanDecision(t: RawTask): string {
  // Human, specific copy. The raw `title` is usually already specific; we just
  // pass it through. If it were generic, we could enrich here.
  return t.title
}

function blockerFromTask(t: RawTask): BlockerItem {
  return {
    id: t.id,
    title: humanDecision(t),
    description: t.description,
    agent: t.agent,
    urgency: t.urgency,
    createdAt: t.createdAt,
    action: { label: t.actionLabel ?? 'Review', kind: 'review' },
    actionUrl: t.actionUrl,
  }
}

function blockerFromApproval(a: RawApproval): BlockerItem {
  return {
    id: `approval-${a.id}`,
    title: `Approve ${a.agentName}'s plan`,
    agent: a.agentName,
    urgency: 'medium',
    createdAt: a.createdAt,
    action: { label: 'Approve', kind: 'approve' },
    actionUrl: a.planUrl,
  }
}

// ── Component ───────────────────────────────────────────────────────────────
export function MobileHome() {
  const h = useHaptics()
  const { agents: teamAgents } = useAgents()

  const [blockers,  setBlockers]  = useState<BlockerItem[]>([])
  const [intel,     setIntel]     = useState<HomeIntel | null>(null)
  const [systems,   setSystems]   = useState<HealthItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeBlocker, setActiveBlocker] = useState<BlockerItem | null>(null)

  const refresh = useCallback(async () => {
    const bkd: BlockerItem[] = []

    try {
      const { supabase } = await import('../lib/supabase')

      // Tasks blocked on krish
      try {
        const { data: tasks } = await supabase.from('tasks').select('*').eq('blocked_by', 'krish')
        const mine = ((tasks || []) as any[]).map(t => ({
          id: t.id, title: t.title, description: t.description,
          agent: t.agent, urgency: t.urgency, blockedBy: t.blocked_by,
          createdAt: t.created, actionUrl: t.link_primary, actionLabel: 'Review',
        } as RawTask))
        const high = mine.filter(t => t.urgency === 'high')
        const rest = mine.filter(t => t.urgency !== 'high')
        ;[...high, ...rest].forEach(t => bkd.push(blockerFromTask(t)))
      } catch {}

      setBlockers(bkd)

      // Home intelligence synthesis
      try {
        const { data: hi } = await supabase.from('home_intelligence').select('*').eq('id', 'current').single()
        if (hi) {
          const parsed: any = { generated_at: hi.generated_at || hi.updated_at }
          if (hi.summary) {
            try {
              const summary = typeof hi.summary === 'string' ? JSON.parse(hi.summary) : hi.summary
              Object.assign(parsed, summary)
            } catch { parsed.executive_summary = hi.assessment || hi.summary }
          }
          if (hi.assessment && !parsed.strategic_assessment) {
            parsed.strategic_assessment = { headline: '', body: hi.assessment, recommended_focus: '' }
          }
          setIntel(parsed)
        }
      } catch {}

      // Systems/engines compressed into chips
      try {
        const { data: rows } = await supabase.from('system_health').select('*')
        const chips: HealthItem[] = []
        for (const r of rows || []) {
          const details = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {})
          const status = r.status === 'healthy' ? 'green' : r.status === 'degraded' ? 'amber' : r.status === 'failing' ? 'red' : 'unknown'
          chips.push({ id: r.id, label: details.name || r.component, status })
          if (chips.length >= 8) break
        }
        setSystems(chips)
      } catch {}
    } catch {}

    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30_000)
    return () => clearInterval(iv)
  }, [refresh])

  const synthesisText =
    intel?.strategic_assessment?.headline ??
    intel?.executive_summary ??
    undefined

  const subtitle = blockers.length > 0
    ? `${blockers.length} ${blockers.length === 1 ? 'item needs' : 'items need'} you`
    : 'Nothing blocked on you'

  // Actions rendered in the DetailSheet for the tapped blocker
  const sheetActions: SheetAction[] = activeBlocker ? [
    ...(activeBlocker.actionUrl ? [{
      label: activeBlocker.action?.label ?? 'Open',
      variant: 'primary' as const,
      onClick: () => { h.heavy(); window.open(activeBlocker.actionUrl, '_blank') }
    }] : []),
    { label: 'Mark done', variant: 'secondary' as const, onClick: () => { h.success(); setActiveBlocker(null) } },
    { label: 'Defer for now', variant: 'secondary' as const, onClick: () => { h.select(); setActiveBlocker(null) } },
  ] : []

  return (
    <>
      <MobileShell
        onRefresh={refresh}
        header={
          <TabHeader
            title="Mindmaker OS"
            subtitle={subtitle}
            leading={<Logomark size={40} />}
            trailing={
              <button
                aria-label="More"
                className="w-10 h-10 rounded-full bg-white/[0.05] flex items-center justify-center active:bg-white/[0.10]"
              >
                <MoreHorizontal className="w-5 h-5 text-white/60" />
              </button>
            }
          />
        }
      >
        {/* Synthesis line */}
        {synthesisText && <SynthesisLine text={synthesisText} />}

        {/* Blocker stack (hero) */}
        {loading ? (
          <div className="flex flex-col gap-3">
            <SkeletonCard height={88} />
            <SkeletonCard height={88} />
            <SkeletonCard height={88} />
          </div>
        ) : blockers.length > 0 ? (
          <div className="flex flex-col gap-3">
            {blockers.map(b => (
              <BlockerCard
                key={b.id}
                item={b}
                pod={agentPod(b.agent, teamAgents)}
                onOpen={setActiveBlocker}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-6 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
            <div>
              <p className="text-[17px] font-semibold text-white">Inbox zero.</p>
              <p className="text-[13px] text-white/60 mt-1 leading-relaxed">
                Your agents are running. Enjoy the clarity — next surface will hit when it needs you.
              </p>
            </div>
          </div>
        )}

        {/* Zara signals — below Marcus synthesis */}
        <ZaraIntelligence />

        {/* Systems strip */}
        <HealthStrip items={systems} />

        {/* Team pulse strip */}
        <TeamStrip agents={teamAgents} />
      </MobileShell>

      <DetailSheet
        open={!!activeBlocker}
        onClose={() => setActiveBlocker(null)}
        eyebrow={activeBlocker?.agent ? `Waiting on you · ${activeBlocker.agent}` : 'Waiting on you'}
        title={activeBlocker?.title ?? ''}
        body={activeBlocker?.description}
        agent={activeBlocker?.agent}
        status="needs_you"
        meta={activeBlocker?.createdAt ? undefined : undefined}
        docUrl={activeBlocker?.actionUrl}
        actions={sheetActions}
      />
    </>
  )
}
