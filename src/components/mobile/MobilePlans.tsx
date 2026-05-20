import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, FeedCard, FeedRow, EmptyState } from './primitives'
import { DetailSheet } from './DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { supabase } from '../../lib/supabase'

interface AgentPlan {
  agent_id: string
  current_phase: string | null
  objective: string | null
  blockers: string | null
  next_milestone: string | null
  progress_pct: number | null
  updated_at: string | null
  doc_link: string | null
  weekly_goal_id?: string | null
}

interface AgentRow {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
}

interface GoalRow {
  id: string
  title: string | null
  target: string | null
  current: string | null
  progress: number | null
  status: string | null
  week_of: string | null
}

type Merged = AgentRow & { plan?: AgentPlan; goal?: GoalRow }

function progressTone(pct: number): { dot: string; label: string } {
  if (pct >= 80) return { dot: 'bg-emerald-400', label: 'On track' }
  if (pct >= 40) return { dot: 'bg-violet-400',  label: 'In progress' }
  return                  { dot: 'bg-amber-400',   label: 'Behind' }
}

export function MobilePlans() {
  const h = useHaptics()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [plans, setPlans] = useState<AgentPlan[]>([])
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [a, p, g] = await Promise.all([
        supabase.from('agents').select('id,name,role,pod,active').eq('active', true),
        supabase.from('agent_plans').select('*'),
        supabase.from('goals').select('*'),
      ])
      if (cancelled) return
      setAgents((a.data as AgentRow[]) || [])
      setPlans(p.error ? [] : ((p.data as AgentPlan[]) || []))
      setGoals(g.error ? [] : ((g.data as GoalRow[]) || []))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const merged: Merged[] = useMemo(() => {
    const planMap = new Map(plans.map(p => [p.agent_id, p]))
    const goalById = new Map(goals.map(g => [g.id, g]))
    return agents.map(a => {
      const plan = planMap.get(a.id)
      const goal = plan?.weekly_goal_id ? goalById.get(plan.weekly_goal_id) : undefined
      return { ...a, plan, goal }
    })
  }, [agents, plans, goals])

  const sorted = useMemo(() => {
    return [...merged].sort((a, b) => {
      const ap = a.goal?.progress ?? a.plan?.progress_pct ?? -1
      const bp = b.goal?.progress ?? b.plan?.progress_pct ?? -1
      return ap - bp // lowest progress first — at-risk floats up
    })
  }, [merged])

  const hero = sorted[0] || null
  const heroProgress = hero?.goal?.progress ?? hero?.plan?.progress_pct ?? 0
  const heroTone = progressTone(heroProgress)
  const heroAccent: 'red' | 'amber' | 'violet' | 'emerald' =
    heroProgress >= 80 ? 'emerald' :
    heroProgress >= 40 ? 'violet' :
    heroProgress >= 1  ? 'amber' : 'red'

  const open = openId ? merged.find(m => m.id === openId) ?? null : null

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Plans"
          subtitle={loading ? 'Loading…' : `${agents.length} agents · ${plans.length} plans · ${goals.length} goals`}
        />
      }
    >
      {hero && (
        <HeroCard
          eyebrow={hero.goal?.title ? 'KPI at risk' : 'Lowest progress'}
          dotColor={heroTone.dot}
          accent={heroAccent}
          title={hero.goal?.title || hero.plan?.objective || hero.name}
          detail={
            hero.goal
              ? `${hero.goal.current || '—'} of ${hero.goal.target || '—'}`
              : hero.plan?.next_milestone || hero.role || undefined
          }
          meta={`${hero.name} · ${heroProgress}% · ${heroTone.label}`}
          cta="Open"
          onClick={() => { h.select(); setOpenId(hero.id) }}
        />
      )}

      {agents.length === 0 && !loading && <EmptyState label="No active agents." />}

      {sorted.length > 0 && (
        <FeedCard title={`Agents · ${sorted.length}`}>
          {sorted.map(m => {
            const pct = m.goal?.progress ?? m.plan?.progress_pct ?? 0
            const tone = progressTone(pct)
            return (
              <FeedRow
                key={m.id}
                dotColor={tone.dot}
                title={m.name + (m.role ? ` · ${m.role}` : '')}
                detail={m.plan?.objective || m.goal?.title || m.plan?.current_phase || 'No plan set'}
                trailing={
                  <span className="text-[18px] font-bold tabular-nums text-white/70">
                    {pct}%
                  </span>
                }
                onClick={() => { h.select(); setOpenId(m.id) }}
              />
            )
          })}
        </FeedCard>
      )}

      <DetailSheet
        open={open != null}
        onClose={() => setOpenId(null)}
        eyebrow={open?.role || open?.pod || undefined}
        title={open?.name || ''}
        body={
          open
            ? [
                open.plan?.objective ? `Objective: ${open.plan.objective}` : null,
                open.plan?.current_phase ? `Phase: ${open.plan.current_phase}` : null,
                open.plan?.next_milestone ? `Next: ${open.plan.next_milestone}` : null,
                open.goal?.title ? `KPI: ${open.goal.title} (${open.goal.progress ?? 0}%)` : null,
                open.goal?.target ? `Target: ${open.goal.target}` : null,
                open.goal?.current ? `Current: ${open.goal.current}` : null,
                open.plan?.blockers ? `Blockers: ${open.plan.blockers}` : null,
                open.plan?.updated_at ? `Updated ${formatDistanceToNow(new Date(open.plan.updated_at))} ago` : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        agent={open?.name}
        docUrl={open?.plan?.doc_link || undefined}
        actions={[]}
      />
    </MobileShellPrim>
  )
}
