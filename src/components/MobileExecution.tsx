import React, { useState, useEffect } from 'react'
import { Activity, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface Agent       { name: string; count: number }
interface TaskSummary { total: number; in_progress: number; waiting: number; blocked: number; done: number }
interface Engine {
  id: string; name: string; domain: string; cron?: string
  infra_status: string; qa_status: string
  infra_note?: string; qa_note?: string
  state: string; next_run?: string
}
interface ExecutionState {
  updated_at: string; schema_version: string; system_status: string
  agents_active: Record<string, number>
  task_summary: TaskSummary
  engines: Engine[]
}

const STATUS_COLOR: Record<string, string> = {
  green:       'bg-emerald-400',
  amber:       'bg-amber-400',
  red:         'bg-red-400',
  operational: 'bg-emerald-400',
  degraded:    'bg-amber-400',
  down:        'bg-red-400',
}
const STATUS_TEXT: Record<string, string> = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  red:   'text-red-400',
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
      <div className="flex items-center gap-2 text-[12px] text-white/30 py-8 justify-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading execution state…
      </div>
    )
  }

  const ts = state.task_summary
  const agents = Object.entries(state.agents_active ?? {})
    .sort((a, b) => b[1] - a[1])

  const systemColor = STATUS_COLOR[state.system_status] ?? 'bg-white/20'

  return (
    <div className="space-y-3">

      {/* ── SYSTEM STATUS ─────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel
            icon={<Activity className="w-3.5 h-3.5" />}
            color="text-white/50"
            label="System Status"
          />
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${systemColor}`} />
            <span className="text-[11px] text-white/50 capitalize">{state.system_status}</span>
          </div>
        </div>

        {/* Task summary grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Total',    value: ts.total,       color: 'text-white/60' },
            { label: 'Running',  value: ts.in_progress, color: 'text-emerald-400' },
            { label: 'Waiting',  value: ts.waiting,     color: 'text-amber-400' },
            { label: 'Done',     value: ts.done,        color: 'text-white/30' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] rounded-lg px-1.5 py-2 text-center">
              <p className={`text-[18px] font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── ACTIVE AGENTS ─────────────────────────────── */}
      {agents.length > 0 && (
        <Card>
          <SectionLabel
            icon={<Activity className="w-3.5 h-3.5" />}
            color="text-emerald-400"
            label={`Active Agents (${agents.length})`}
          />
          <div className="mt-2.5 space-y-2">
            {agents.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-emerald-400">{name[0]?.toUpperCase()}</span>
                  </div>
                  <span className="text-[13px] text-white/75">{name}</span>
                </div>
                <span className="text-[11px] font-mono text-white/35">{count} task{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── ENGINES / CRONS ───────────────────────────── */}
      <Card>
        <SectionLabel
          icon={<Activity className="w-3.5 h-3.5" />}
          color="text-violet-400"
          label={`Engines (${state.engines?.length ?? 0})`}
        />
        <div className="mt-2.5 space-y-1">
          {(state.engines ?? []).map((eng, i) => {
            const infraOk = eng.infra_status === 'green'
            const qaOk    = eng.qa_status === 'green'
            const allOk   = infraOk && qaOk
            return (
              <div key={eng.id}>
                <div className="flex items-start gap-2.5 py-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${STATUS_COLOR[eng.infra_status] ?? 'bg-white/20'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-white/80 truncate">{eng.name}</p>
                      <span className={`text-[10px] flex-shrink-0 ${allOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {allOk ? '✓' : '!'}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5">{eng.domain}</p>
                    {!infraOk && eng.infra_note && (
                      <p className="text-[10px] text-red-400/70 mt-0.5 leading-relaxed">{eng.infra_note}</p>
                    )}
                    {!qaOk && eng.qa_note && (
                      <p className="text-[10px] text-amber-400/70 mt-0.5 leading-relaxed">{eng.qa_note}</p>
                    )}
                    {eng.next_run && (
                      <p className="text-[10px] text-white/20 mt-0.5">{eng.next_run}</p>
                    )}
                  </div>
                </div>
                {i < (state.engines?.length ?? 0) - 1 && (
                  <div className="border-t border-white/[0.04]" />
                )}
              </div>
            )
          })}
        </div>
      </Card>

    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-sm">
      {children}
    </div>
  )
}

function SectionLabel({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
    </div>
  )
}
