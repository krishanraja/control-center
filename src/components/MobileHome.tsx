import React, { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, TrendingUp, Clock, Users, Activity, Zap, Circle } from 'lucide-react'
import { AGENTS } from '../services/agentData'

interface BlockedTask { id: string; title: string; description?: string; urgency?: string; agent?: string; blockedBy?: string }
interface TodayItem   { id: string; title: string; detail?: string; owner: string; status: string; priority: number; est?: string }
interface Goal        { id: string; title: string; target: string; current: string; owner: string; progress: number }
interface GoalsData   { week_of: string; team_focus?: string; goals: Goal[] }
interface Approval    { id: string; agentName: string; agentId: string; planUrl?: string; status: string }

const URGENCY_DOT: Record<string, string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
}

export function MobileHome() {
  const [blocked,   setBlocked]   = useState<BlockedTask[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [goals,     setGoals]     = useState<GoalsData | null>(null)
  const [today,     setToday]     = useState<TodayItem[]>([])
  const [n8n,       setN8n]       = useState<any>(null)

  const refreshAll = () => {
    fetch('/api/data', { cache: 'no-cache' }).then(r => r.json())
      .then(d => setBlocked((d.tasks || []).filter((t: any) => t.blockedBy === 'krish')))
      .catch(() => {})

    fetch('/api/approvals', { cache: 'no-cache' }).then(r => r.json())
      .then(d => setApprovals((d.items || []).filter((a: any) => a.status === 'pending')))
      .catch(() => {})

    fetch('/api/goals', { cache: 'no-cache' }).then(r => r.json()).then(setGoals).catch(() => {})

    fetch('/api/today', { cache: 'no-cache' }).then(r => r.json())
      .then(d => setToday((d.items || []).filter((i: any) => i.owner === 'krish')))
      .catch(() => {})

    fetch('/api/status', { cache: 'no-cache' }).then(r => r.json()).then(setN8n).catch(() => {})
  }

  useEffect(() => {
    refreshAll()
    const iv = setInterval(refreshAll, 30000)
    return () => clearInterval(iv)
  }, [])

  const highBlocked  = blocked.filter(t => t.urgency === 'high')
  const otherBlocked = blocked.filter(t => t.urgency !== 'high')
  const allBlocked   = [...highBlocked, ...otherBlocked]
  const blockedAgents = AGENTS.filter(a => a.blockers && a.blockers.length > 0)
  const agentCounts = {
    running: AGENTS.filter(a => a.status === 'running').length,
    blocked: AGENTS.filter(a => a.status === 'blocked').length,
    waiting: AGENTS.filter(a => a.status === 'waiting').length,
  }

  return (
    <div className="space-y-3">

      {/* ── 1. NEEDS YOU ─────────────────────────────── */}
      <Card>
        <SectionLabel icon={<AlertTriangle className="w-3.5 h-3.5" />} color="text-amber-400" label={`Needs You${blocked.length > 0 ? ` (${blocked.length})` : ''}`} />

        {allBlocked.length === 0 ? (
          <div className="flex items-center gap-2 text-[12px] text-white/30 mt-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/50" />
            Nothing blocked
          </div>
        ) : (
          <div className="mt-2.5 space-y-3">
            {allBlocked.map(t => (
              <div key={t.id} className="flex gap-2.5">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${URGENCY_DOT[t.urgency ?? 'medium'] ?? 'bg-white/30'}`} />
                <div>
                  <p className="text-[13px] font-medium text-white leading-snug">{t.title}</p>
                  {t.description && <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{t.description}</p>}
                  {t.agent && <p className="text-[10px] text-white/25 mt-0.5">from {t.agent}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 2. APPROVE ───────────────────────────────── */}
      {approvals.length > 0 && (
        <Card>
          <SectionLabel icon={<Zap className="w-3.5 h-3.5" />} color="text-violet-400" label={`Approve (${approvals.length})`} />
          <div className="mt-2.5 space-y-2">
            {approvals.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-violet-400">{a.agentName[0]}</span>
                  </div>
                  <span className="text-[12px] text-white/70">{a.agentName}</span>
                </div>
                {a.planUrl && (
                  <a href={a.planUrl} target="_blank" rel="noreferrer"
                    className="text-[10px] text-violet-400/60 hover:text-violet-400">
                    View →
                  </a>
                )}
              </div>
            ))}
            {approvals.length > 5 && (
              <p className="text-[11px] text-white/30">+{approvals.length - 5} more</p>
            )}
          </div>
        </Card>
      )}

      {/* ── 3. THIS WEEK ─────────────────────────────── */}
      <Card>
        {goals?.team_focus && (
          <div className="bg-violet-500/[0.06] border border-violet-500/20 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-0.5">This Week</p>
            <p className="text-[12px] text-white/75 leading-relaxed">{goals.team_focus}</p>
          </div>
        )}

        <SectionLabel icon={<TrendingUp className="w-3.5 h-3.5" />} color="text-emerald-400" label={`Goals — ${goals?.week_of ?? ''}`} />

        <div className="mt-2.5 space-y-3">
          {(goals?.goals ?? []).map(g => (
            <div key={g.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-white/80">{g.title}</span>
                <span className="text-[11px] font-mono text-white/35">{g.progress}%</span>
              </div>
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    g.progress === 0 ? 'bg-white/10' :
                    g.progress >= 80 ? 'bg-emerald-400' :
                    g.progress >= 40 ? 'bg-amber-400' : 'bg-violet-400'
                  }`}
                  style={{ width: `${g.progress}%` }}
                />
              </div>
              <p className="text-[10px] text-white/25 mt-0.5">{g.current} · {g.owner}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 4. TODAY ─────────────────────────────────── */}
      <Card>
        <SectionLabel icon={<Clock className="w-3.5 h-3.5" />} color="text-white/40" label="Your Actions Today" />
        {today.length === 0 ? (
          <p className="text-[12px] text-white/30 mt-2">Nothing queued</p>
        ) : (
          <div className="mt-2.5 space-y-2.5">
            {today.slice(0, 5).map((item, i) => (
              <div key={item.id} className="flex items-start gap-3">
                <span className="text-[11px] font-mono text-white/20 mt-0.5 w-4 flex-shrink-0">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-white/75">{item.title}</p>
                  {item.detail && <p className="text-[10px] text-white/35 mt-0.5 leading-relaxed">{item.detail}</p>}
                </div>
                {item.est && <span className="text-[10px] text-white/25 flex-shrink-0 mt-0.5">{item.est}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 5. PULSE ─────────────────────────────────── */}
      <Card>
        <SectionLabel icon={<Users className="w-3.5 h-3.5" />} color="text-white/50" label={`Team (${AGENTS.length} agents)`} />

        <div className="grid grid-cols-3 gap-2 mt-2.5 mb-3">
          {[
            { label: 'Running', value: agentCounts.running, color: 'text-emerald-400' },
            { label: 'Waiting', value: agentCounts.waiting, color: 'text-white/50' },
            { label: 'Blocked', value: agentCounts.blocked, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] rounded-lg px-2.5 py-2 text-center">
              <p className={`text-[20px] font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {blockedAgents.map(a => (
          <div key={a.id} className="flex items-start gap-2 mb-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
            <p className="text-[11px] text-white/50">
              <span className="text-white/70 font-medium">{a.humanName}:</span> {a.blockers?.[0]}
            </p>
          </div>
        ))}

        {n8n?.workflows && (
          <div className="border-t border-white/[0.06] mt-3 pt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Circle className={`w-2 h-2 fill-current ${n8n.workflows.errors === 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-[11px] text-white/40">
                N8N: {n8n.workflows.active}/{n8n.workflows.total} active
              </span>
            </div>
            {n8n.workflows.errors > 0 && (
              <span className="text-[11px] text-red-400">{n8n.workflows.errors} errors</span>
            )}
          </div>
        )}
      </Card>

    </div>
  )
}

/* ─── Shared primitives ─────────────────────────────────── */
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
