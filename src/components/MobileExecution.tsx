import React, { useState, useEffect } from 'react'
import {
  MobileShell, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState,
} from './mobile/primitives'

interface TaskSummary { total: number; in_progress: number; waiting: number; blocked: number; done: number }
interface Engine {
  id: string; name: string; domain: string; cron?: string
  infra_status: string; qa_status: string
  infra_note?: string; qa_note?: string
  state: string; next_run?: string
}
interface ExecutionState {
  updated_at: string; system_status: string
  agents_active: Record<string, number>
  task_summary: TaskSummary
  engines: Engine[]
}

const STATUS_DOT: Record<string, string> = {
  green:       'bg-emerald-400',
  amber:       'bg-amber-400',
  red:         'bg-red-400',
  operational: 'bg-emerald-400',
  degraded:    'bg-amber-400',
  down:        'bg-red-400',
}

const SYSTEM_LABEL: Record<string, string> = {
  operational: 'All systems operational',
  degraded:    'Some systems degraded',
  down:        'Outage detected',
}

function worstStatus(e: Engine): 'red' | 'amber' | 'green' {
  if (e.infra_status === 'red' || e.qa_status === 'red') return 'red'
  if (e.infra_status === 'amber' || e.qa_status === 'amber') return 'amber'
  return 'green'
}

export function MobileExecution() {
  const [state, setState] = useState<ExecutionState | null>(null)

  const refresh = () => {
    fetch('/data/execution-state.json', { cache: 'no-cache' }).then(r => r.json())
      .then(setState).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  if (!state) {
    return (
      <MobileShell header={<TabHeader title="Execution" />}>
        <EmptyState label="Loading execution state…" />
      </MobileShell>
    )
  }

  const ts = state.task_summary
  const engines = state.engines ?? []
  const redEngines   = engines.filter(e => worstStatus(e) === 'red')
  const amberEngines = engines.filter(e => worstStatus(e) === 'amber')
  const greenEngines = engines.filter(e => worstStatus(e) === 'green')

  const agents = Object.entries(state.agents_active ?? {})
    .sort((a, b) => b[1] - a[1])

  const heroEngine = redEngines[0] ?? amberEngines[0]

  return (
    <MobileShell
      header={<TabHeader title="Execution" subtitle={`${ts.in_progress} in progress · ${ts.waiting} waiting · ${ts.blocked} blocked`} />}
    >
      {heroEngine ? (
        <HeroCard
          eyebrow={`Engine attention · ${heroEngine.domain}`}
          accent={worstStatus(heroEngine) === 'red' ? 'red' : 'amber'}
          dotColor={STATUS_DOT[worstStatus(heroEngine)]}
          title={heroEngine.name}
          detail={heroEngine.qa_note || heroEngine.infra_note}
          meta={heroEngine.next_run ? `Next: ${heroEngine.next_run}` : heroEngine.state}
        />
      ) : (
        <HeroCard
          eyebrow="System status"
          accent="emerald"
          dotColor="bg-emerald-400"
          title={SYSTEM_LABEL[state.system_status] ?? 'Operational'}
          detail={`${greenEngines.length}/${engines.length} engines green · ${ts.in_progress} tasks in progress`}
        />
      )}

      <div className="flex gap-2">
        <StatPill label="Running" value={ts.in_progress} color="text-emerald-400" />
        <StatPill label="Waiting" value={ts.waiting} color="text-white/60" />
        <StatPill label="Blocked" value={ts.blocked} color={ts.blocked > 0 ? 'text-red-400' : 'text-white/60'} />
      </div>

      {agents.length > 0 && (
        <FeedCard title={`Agents active · ${agents.length}`}>
          {agents.slice(0, 10).map(([name, count]) => (
            <FeedRow
              key={name}
              dotColor="bg-emerald-400"
              title={name}
              trailing={<span className="text-[11px] font-mono text-white/40">{count}</span>}
            />
          ))}
        </FeedCard>
      )}

      {engines.length > 0 && (
        <FeedCard title={`Engines · ${engines.length}`}>
          {[...redEngines, ...amberEngines, ...greenEngines].map(e => (
            <FeedRow
              key={e.id}
              dotColor={STATUS_DOT[worstStatus(e)]}
              title={e.name}
              detail={`${e.domain} · ${e.state}${e.next_run ? ' · next ' + e.next_run : ''}`}
              trailing={<span className="text-[10px] text-white/30 uppercase tracking-wide">{worstStatus(e)}</span>}
            />
          ))}
        </FeedCard>
      )}
    </MobileShell>
  )
}
