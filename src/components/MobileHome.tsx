import React, { useState, useEffect } from 'react'
import { AGENTS } from '../services/agentData'
import {
  MobileShell, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState,
} from './mobile/primitives'

interface BlockedTask { id: string; title: string; description?: string; urgency?: string; agent?: string; blockedBy?: string }
interface Goal        { id: string; title: string; progress: number }
interface GoalsData   { week_of?: string; goals?: Goal[] }
interface Approval    { id: string; agentName: string; planUrl?: string; status: string }

const URGENCY_DOT: Record<string, string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
}

export function MobileHome() {
  const [blocked,   setBlocked]   = useState<BlockedTask[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [goals,     setGoals]     = useState<GoalsData | null>(null)

  const refresh = () => {
    fetch('/api/data', { cache: 'no-cache' }).then(r => r.json())
      .then(d => {
        const mine = (d.tasks || []).filter((t: any) => t.blockedBy === 'krish')
        const high = mine.filter((t: any) => t.urgency === 'high')
        const rest = mine.filter((t: any) => t.urgency !== 'high')
        setBlocked([...high, ...rest])
      }).catch(() => {})

    fetch('/api/approvals', { cache: 'no-cache' }).then(r => r.json())
      .then(d => setApprovals((d.items || []).filter((a: any) => a.status === 'pending')))
      .catch(() => {})

    fetch('/api/goals', { cache: 'no-cache' }).then(r => r.json())
      .then(setGoals).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  const goalsList = goals?.goals ?? []
  const goalsOnTrack = goalsList.filter(g => g.progress >= 40).length
  const agentCounts = {
    running: AGENTS.filter(a => a.status === 'running').length,
    blocked: AGENTS.filter(a => a.status === 'blocked').length,
  }

  const hero = blocked[0]
  const restBlocked = blocked.slice(1)

  return (
    <MobileShell
      header={<TabHeader title="Mindmaker OS" subtitle="Everything that needs you" />}
    >
      {/* Hero: top blocker, or approvals, or all-clear */}
      {hero ? (
        <HeroCard
          eyebrow={`Needs you · ${blocked.length}`}
          accent={hero.urgency === 'high' ? 'red' : 'amber'}
          dotColor={URGENCY_DOT[hero.urgency ?? 'medium']}
          title={hero.title}
          detail={hero.description}
          meta={hero.agent ? `from ${hero.agent}` : undefined}
          cta="Open"
        />
      ) : approvals.length > 0 ? (
        <HeroCard
          eyebrow={`Pending approvals · ${approvals.length}`}
          accent="violet"
          dotColor="bg-violet-400"
          title={`${approvals.length} plan${approvals.length === 1 ? '' : 's'} awaiting your approval`}
          detail={approvals.slice(0, 3).map(a => a.agentName).join(' · ')}
          cta="Review"
        />
      ) : (
        <HeroCard
          eyebrow="All clear"
          accent="emerald"
          dotColor="bg-emerald-400"
          title="Nothing blocked on you"
          detail="Your agents are running — check back when something surfaces."
        />
      )}

      {/* Stat strip */}
      <div className="flex gap-2">
        <StatPill label="Blocked" value={blocked.length} color={blocked.length > 0 ? 'text-red-400' : 'text-white/60'} />
        <StatPill label="Approvals" value={approvals.length} color={approvals.length > 0 ? 'text-violet-300' : 'text-white/60'} />
        <StatPill label="Goals" value={`${goalsOnTrack}/${goalsList.length || 0}`} sub="on track" color="text-emerald-400" />
      </div>

      {/* Secondary feed: remaining blockers + approvals */}
      {(restBlocked.length > 0 || approvals.length > 0) && (
        <FeedCard title="Queue">
          {restBlocked.map(t => (
            <FeedRow
              key={`b-${t.id}`}
              dotColor={URGENCY_DOT[t.urgency ?? 'medium'] ?? 'bg-white/30'}
              title={t.title}
              detail={t.agent ? `from ${t.agent}` : t.description}
              trailing={<span className="text-[10px] text-white/30 uppercase tracking-wide">Blocked</span>}
            />
          ))}
          {approvals.slice(0, 8).map(a => (
            <FeedRow
              key={`a-${a.id}`}
              dotColor="bg-violet-400"
              title={`${a.agentName} — plan ready for review`}
              trailing={a.planUrl ? (
                <a href={a.planUrl} target="_blank" rel="noreferrer"
                  className="text-[11px] text-violet-300 active:opacity-60"
                >Open →</a>
              ) : undefined}
            />
          ))}
        </FeedCard>
      )}

      {/* Team pulse mini row */}
      <FeedCard title="Team pulse">
        <FeedRow
          dotColor="bg-emerald-400"
          title={`${agentCounts.running} running`}
          detail={`${AGENTS.length} agents · ${agentCounts.blocked} blocked`}
        />
      </FeedCard>

      {blocked.length === 0 && approvals.length === 0 && goalsList.length === 0 && (
        <EmptyState label="No live data yet — give it a moment." />
      )}
    </MobileShell>
  )
}
