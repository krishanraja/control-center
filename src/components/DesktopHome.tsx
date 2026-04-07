import React, { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Clock, ChevronRight, Zap, TrendingUp, Users, Activity, Circle } from 'lucide-react'
import { AGENTS } from '../services/agentData'

/* ─── Types ──────────────────────────────────────────── */
interface BlockedTask { id: string; title: string; description?: string; urgency?: string; agent?: string; daysOld?: number; blockedBy?: string }
interface TodayItem   { id: string; title: string; detail?: string; owner: string; status: string; priority: number; est?: string }
interface Goal        { id: string; title: string; target: string; current: string; owner: string; progress: number }
interface GoalsData   { week_of: string; north_star: string; team_focus?: string; goals: Goal[] }
interface Approval    { id: string; agentName: string; agentId: string; planTitle: string; status: string; planUrl?: string }

const URGENCY_DOT: Record<string, string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
}

function UrgencyDot({ urgency = 'medium' }: { urgency?: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${URGENCY_DOT[urgency] ?? 'bg-white/30'}`} />
}

/* ─── Left column: Needs You ───────────────────────────── */
function NeedsYou() {
  const [blocked, setBlocked]     = useState<BlockedTask[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(d =>
      setBlocked((d.tasks || []).filter((t: any) => t.blockedBy === 'krish'))
    ).catch(() => {})

    fetch('/api/approvals').then(r => r.json()).then(d =>
      setApprovals((d.items || []).filter((a: any) => a.status === 'pending'))
    ).catch(() => {})
  }, [])

  const highBlocked  = blocked.filter(t => t.urgency === 'high')
  const otherBlocked = blocked.filter(t => t.urgency !== 'high')

  return (
    <div className="flex flex-col gap-5">

      {/* Blocked on you */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
            Blocked on You {blocked.length > 0 && `(${blocked.length})`}
          </span>
        </div>

        {blocked.length === 0 ? (
          <div className="flex items-center gap-2 text-[12px] text-white/30 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/50" />
            Nothing blocked
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...highBlocked, ...otherBlocked].map(t => (
              <div key={t.id} className="flex gap-2.5">
                <UrgencyDot urgency={t.urgency} />
                <div>
                  <p className="text-[13px] font-medium text-white leading-snug">{t.title}</p>
                  {t.description && (
                    <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{t.description}</p>
                  )}
                  {t.agent && (
                    <p className="text-[10px] text-white/25 mt-0.5">from {t.agent}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <div className="border-t border-white/[0.06]" />

      {/* Approvals */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400">
              Approve {approvals.length > 0 && `(${approvals.length})`}
            </span>
          </div>
          <a href="/approvals" className="text-[10px] text-violet-400/60 hover:text-violet-400 transition-colors">
            Review all →
          </a>
        </div>

        {approvals.length === 0 ? (
          <p className="text-[12px] text-white/30 py-2">No pending approvals</p>
        ) : (
          <div className="space-y-2">
            {approvals.slice(0, 6).map(a => (
              <div key={a.id} className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-violet-400">{a.agentName[0]}</span>
                  </div>
                  <span className="text-[12px] text-white/70">{a.agentName}</span>
                </div>
                {a.planUrl && (
                  <a href={a.planUrl} target="_blank" rel="noreferrer"
                    className="text-[10px] text-violet-400/50 hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </a>
                )}
              </div>
            ))}
            {approvals.length > 6 && (
              <p className="text-[11px] text-white/30 pt-1">+{approvals.length - 6} more</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/* ─── Centre column: This Week ──────────────────────────── */
function ThisWeek() {
  const [goals, setGoals]   = useState<GoalsData | null>(null)
  const [today, setToday]   = useState<TodayItem[]>([])

  useEffect(() => {
    fetch('/api/goals').then(r => r.json()).then(setGoals).catch(() => {})
    fetch('/api/today').then(r => r.json()).then(d => setToday(d.items || [])).catch(() => {})
  }, [])

  const krishItems = today.filter(i => i.owner === 'krish').slice(0, 5)

  return (
    <div className="flex flex-col gap-5">

      {/* North star */}
      {goals?.team_focus && (
        <div className="bg-violet-500/[0.06] border border-violet-500/20 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-1">This Week's Focus</p>
          <p className="text-[13px] text-white/80 leading-relaxed">{goals.team_focus}</p>
        </div>
      )}

      {/* Goals */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
            Goals — {goals?.week_of ?? ''}
          </span>
        </div>

        <div className="space-y-3">
          {(goals?.goals ?? []).map(g => (
            <div key={g.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-white/80">{g.title}</span>
                <span className="text-[11px] font-mono text-white/40">{g.progress}%</span>
              </div>
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    g.progress === 0 ? 'bg-white/10' :
                    g.progress >= 80 ? 'bg-emerald-400' :
                    g.progress >= 40 ? 'bg-amber-400' : 'bg-violet-400'
                  }`}
                  style={{ width: `${g.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-white/30 mt-0.5">{g.current} · {g.owner}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-white/[0.06]" />

      {/* Today */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-white/40" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">Your Actions Today</span>
        </div>

        {krishItems.length === 0 ? (
          <p className="text-[12px] text-white/30">Nothing queued</p>
        ) : (
          <div className="space-y-2">
            {krishItems.map((item, i) => (
              <div key={item.id} className="flex items-start gap-3">
                <span className="text-[11px] font-mono text-white/20 mt-0.5 w-4 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-white/75 leading-snug">{item.title}</p>
                  {item.detail && (
                    <p className="text-[10px] text-white/35 mt-0.5 leading-relaxed truncate">{item.detail}</p>
                  )}
                </div>
                {item.est && (
                  <span className="text-[10px] text-white/25 flex-shrink-0 mt-0.5">{item.est}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ─── Right column: Pulse ───────────────────────────────── */
function Pulse() {
  const [n8nStatus, setN8nStatus] = useState<any>(null)

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(setN8nStatus).catch(() => {})
  }, [])

  const byStatus = {
    running: AGENTS.filter(a => a.status === 'running').length,
    blocked: AGENTS.filter(a => a.status === 'blocked').length,
    waiting: AGENTS.filter(a => a.status === 'waiting').length,
    done:    AGENTS.filter(a => a.status === 'done').length,
  }

  // Agents with blockers that need Krish
  const blockedAgents = AGENTS.filter(a => a.blockers && a.blockers.length > 0)

  const wf = n8nStatus?.workflows
  const systemOk = wf ? wf.errors === 0 : null

  return (
    <div className="flex flex-col gap-5">

      {/* Revenue pipeline */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Pipeline</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-white/60">Skyview engagement</span>
            <span className="text-[12px] font-mono text-emerald-400">£120K</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/35">Status</span>
            <span className="text-[11px] text-amber-400">Proposal stage</span>
          </div>
        </div>
      </section>

      <div className="border-t border-white/[0.06]" />

      {/* Agent network */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-3.5 h-3.5 text-white/50" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
            Team ({AGENTS.length} agents)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: 'Running',  value: byStatus.running, color: 'text-emerald-400' },
            { label: 'Waiting',  value: byStatus.waiting, color: 'text-white/50' },
            { label: 'Blocked',  value: byStatus.blocked, color: 'text-red-400' },
            { label: 'Done',     value: byStatus.done,    color: 'text-white/30' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] rounded-lg px-3 py-2">
              <p className={`text-[18px] font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-white/30 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {blockedAgents.length > 0 && (
          <div className="space-y-1.5">
            {blockedAgents.map(a => (
              <div key={a.id} className="flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                <p className="text-[11px] text-white/50">
                  <span className="text-white/70 font-medium">{a.humanName}:</span>{' '}
                  {a.blockers?.[0]}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-white/[0.06]" />

      {/* System health */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-3.5 h-3.5 text-white/40" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">System</span>
        </div>

        {!wf ? (
          <p className="text-[11px] text-white/25">Loading...</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">N8N workflows</span>
              <span className={`text-[12px] font-medium ${systemOk ? 'text-emerald-400' : 'text-red-400'}`}>
                {wf.active}/{wf.total} active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">Errors</span>
              <span className={`text-[12px] font-mono ${wf.errors > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {wf.errors}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Circle className={`w-2 h-2 fill-current ${systemOk ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-[11px] text-white/40">
                {systemOk ? 'All systems operational' : `${wf.errors} workflow${wf.errors !== 1 ? 's' : ''} in error`}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

/* ─── Desktop Home: 3-column grid ───────────────────────── */
export function DesktopHome({ currentTime }: { currentTime: Date }) {
  const dow = currentTime.toLocaleDateString('en-GB', { weekday: 'long' })
  const date = currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-[1400px] mx-auto">

      {/* Header row */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Good morning.</h1>
          <p className="text-[13px] text-white/35 mt-0.5">{dow}, {date}</p>
        </div>
        <div className="font-mono text-3xl font-light text-white/60 tabular-nums">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-[300px_1fr_280px] gap-5 items-start">

        {/* Left: Needs You */}
        <div className="bg-[#111118] border border-white/[0.07] rounded-2xl p-5">
          <NeedsYou />
        </div>

        {/* Centre: This Week */}
        <div className="bg-[#111118] border border-white/[0.07] rounded-2xl p-5">
          <ThisWeek />
        </div>

        {/* Right: Pulse */}
        <div className="bg-[#111118] border border-white/[0.07] rounded-2xl p-5">
          <Pulse />
        </div>

      </div>

      {/* Secondary row: Org chart + agent grid accessible via scroll */}
      <p className="text-[10px] text-white/20 text-center mt-8 tracking-widest uppercase">
        Scroll for org chart · agent grid · automations
      </p>

    </div>
  )
}
