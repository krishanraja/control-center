import React, { useState, useEffect } from 'react'
import {
  MobileShell, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState,
} from './mobile/primitives'

interface BlockedTask { id: string; title: string; description?: string; urgency?: string; agent?: string; blockedBy?: string }
interface TodayItem   { id: string; title: string; detail?: string; owner: string; priority: number; est?: string }
interface Goal        { id: string; title: string; progress: number; owner?: string }
interface GoalsData   { week_of?: string; team_focus?: string; goals?: Goal[] }

export function MobileToday() {
  const [blocked, setBlocked] = useState<BlockedTask[]>([])
  const [today,   setToday]   = useState<TodayItem[]>([])
  const [goals,   setGoals]   = useState<GoalsData | null>(null)

  const refresh = () => {
    import('../lib/supabase').then(({ supabase }) => {
      // Tasks blocked on krish
      supabase.from('tasks').select('*').eq('blocked_by', 'krish').then(({ data: tasks }) => {
        const mine = (tasks || []).map((t: any) => ({
          id: t.id, title: t.title, description: t.description,
          urgency: t.urgency, agent: t.agent, blockedBy: t.blocked_by,
        }))
        const high = mine.filter((t: any) => t.urgency === 'high')
        const rest = mine.filter((t: any) => t.urgency !== 'high')
        setBlocked([...high, ...rest])
      }, () => {})

      // Today items - tasks owned by krish that aren't done
      supabase.from('tasks').select('*').eq('owner', 'krish').neq('status', 'done').then(({ data: tasks }) => {
        const items: TodayItem[] = (tasks || []).map((t: any) => ({
          id: t.id, title: t.title, detail: t.description,
          owner: t.owner || 'krish', priority: t.priority || 99, est: undefined,
        }))
        setToday(items.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)))
      }, () => {})

      // Goals
      supabase.from('goals').select('*').then(({ data: goalRows }) => {
        if (goalRows && goalRows.length > 0) {
          const goals: Goal[] = goalRows.map((g: any) => ({
            id: g.id, title: g.title, progress: g.progress || 0, owner: g.owner,
          }))
          supabase.from('system_config').select('value').eq('key', 'week_of').single().then(({ data: wk }) => {
            setGoals({ week_of: wk?.value || undefined, goals })
          }, () => setGoals({ goals }))
        }
      }, () => {})
    }).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  const goalsList = goals?.goals ?? []
  const avgGoalProgress = goalsList.length
    ? Math.round(goalsList.reduce((a, g) => a + (g.progress ?? 0), 0) / goalsList.length)
    : 0

  const hero = today[0] ?? (blocked[0] ? {
    id: blocked[0].id,
    title: blocked[0].title,
    detail: blocked[0].description,
    owner: 'krish',
    priority: 1,
    est: undefined,
  } as TodayItem : null)

  return (
    <MobileShell
      header={<TabHeader title="Today" subtitle={goals?.week_of ? `Week of ${goals.week_of}` : 'Your next moves'} />}
    >
      {hero ? (
        <HeroCard
          eyebrow="Your next move"
          accent="violet"
          dotColor="bg-violet-400"
          title={hero.title}
          detail={hero.detail}
          meta={hero.est}
          cta="Start"
        />
      ) : (
        <HeroCard
          eyebrow="Today"
          accent="emerald"
          dotColor="bg-emerald-400"
          title="Inbox zero"
          detail="Nothing queued for you right now."
        />
      )}

      <div className="flex gap-3">
        <StatPill label="Blocked" value={blocked.length} color={blocked.length > 0 ? 'text-red-400' : 'text-white/60'} />
        <StatPill label="Goals" value={`${avgGoalProgress}%`} color={avgGoalProgress >= 60 ? 'text-emerald-400' : 'text-amber-300'} sub="avg" />
        <StatPill label="Today" value={today.length} color="text-violet-300" />
      </div>

      {today.length > 1 && (
        <FeedCard title="Also today">
          {today.slice(1, 12).map(item => (
            <FeedRow
              key={item.id}
              dotColor="bg-white/30"
              title={item.title}
              detail={item.detail}
              trailing={item.est ? (
                <span className="text-[12px] font-semibold text-white/50">{item.est}</span>
              ) : undefined}
            />
          ))}
        </FeedCard>
      )}

      {goalsList.length > 0 && (
        <FeedCard title="Goals" fill>
          {goalsList.map(g => (
            <div key={g.id} className="px-7 py-6">
              <div className="flex items-center justify-between mb-3.5">
                <p className="text-[19px] font-semibold text-white leading-snug truncate pr-3">{g.title}</p>
                <span className="text-[18px] font-mono font-bold text-white/70 flex-shrink-0">{g.progress}%</span>
              </div>
              <div className="h-3 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    g.progress === 0 ? 'bg-white/10' :
                    g.progress >= 80 ? 'bg-emerald-400' :
                    g.progress >= 40 ? 'bg-amber-400' : 'bg-violet-400'
                  }`}
                  style={{ width: `${Math.min(g.progress, 100)}%` }}
                />
              </div>
              {g.owner && <p className="text-[15px] text-white/45 mt-3">{g.owner}</p>}
            </div>
          ))}
        </FeedCard>
      )}

      {today.length === 0 && blocked.length === 0 && goalsList.length === 0 && (
        <EmptyState label="No today data yet." />
      )}
    </MobileShell>
  )
}
