import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Crown, Cog, Sparkles, Zap, Play, Loader2, Pencil, Check, X, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'
import { FlagAgentModal } from '../FlagAgentModal'
import { NextActionStrip } from '../shared/NextActionStrip'
import { usePendingCorrections, type PendingCorrection } from '../../hooks/usePendingCorrections'

interface Agent {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
  mandate?: string
  last_run?: string
  last_output?: string
  brief_content?: string
  personality?: string | null
  mission?: string | null
  expected_runs_per_day?: number | null
  kpi_label?: string | null
  kpi_target?: string | null
  kpi_current?: string | null
}

interface AgentPlan {
  agent_id: string
  objective: string | null
  current_phase: string | null
  next_milestone: string | null
  progress_pct: number | null
}

interface EditForm {
  brief_content: string
  objective: string
  current_phase: string
  next_milestone: string
  progress_pct: number
}

const EMPTY_FORM: EditForm = {
  brief_content: '',
  objective: '',
  current_phase: '',
  next_milestone: '',
  progress_pct: 0,
}

interface PodDef {
  key: string
  label: string
  accent: string      // text color for section header
  ring: string        // border accent
  tint: string        // subtle background tint
  chip: string        // pod-chip classes
  icon: React.ReactNode
  description?: string
}

// Pods are rendered in strict hierarchy order: Executive → Ops → Growth → other.
const POD_DEFS: Record<string, PodDef> = {
  executive: {
    key: 'executive',
    label: 'Executive',
    accent: 'text-purple-300',
    ring: 'border-purple-500/30',
    tint: 'from-purple-500/[0.06] to-transparent',
    chip: 'text-purple-300 border-purple-500/30 bg-purple-500/10',
    icon: <Crown size={13} />,
    description: 'Sets direction. Owns cross-venture decisions.',
  },
  ops: {
    key: 'ops',
    label: 'Operations',
    accent: 'text-blue-300',
    ring: 'border-blue-500/30',
    tint: 'from-blue-500/[0.06] to-transparent',
    chip: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    icon: <Cog size={13} />,
    description: 'Runs the machine. Quality, infra, product.',
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    accent: 'text-emerald-300',
    ring: 'border-emerald-500/30',
    tint: 'from-emerald-500/[0.06] to-transparent',
    chip: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    icon: <Sparkles size={13} />,
    description: 'Revenue, pipeline, visibility.',
  },
}
const POD_ORDER = ['executive', 'ops', 'growth']

function podOf(pod?: string): PodDef {
  const key = (pod || '').toLowerCase()
  return POD_DEFS[key] || {
    key: key || 'unassigned',
    label: humanize(pod) || 'Unassigned',
    accent: 'text-white/60',
    ring: 'border-white/15',
    tint: 'from-white/[0.02] to-transparent',
    chip: 'text-white/55 border-white/15 bg-white/[0.04]',
    icon: <Cog size={13} />,
  }
}

export function DesktopOrg() {
  const [agents, setAgents] = useState<Agent[]>([])
  const pendingCorrections = usePendingCorrections(5)

  // CLO-005 (audit 2026-05-26): react to ?correction=:id in hash. If a
  // matching pending correction exists, scroll its row into view and
  // outline it for 4s so user sees what the route surfaced.
  React.useEffect(() => {
    const params = new URLSearchParams((typeof window !== 'undefined' ? window.location.hash : '').split('?')[1] || '')
    const cid = params.get('correction')
    if (!cid) return
    const tryFocus = () => {
      const el = document.querySelector(`[data-correction-id="${cid}"]`) as HTMLElement | null
      if (!el) return false
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid rgba(139, 92, 246, 0.7)'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '8px'
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 4000)
      return true
    }
    // panel may mount async — retry briefly
    let tries = 0
    const iv = setInterval(() => { tries++; if (tryFocus() || tries > 10) clearInterval(iv) }, 200)
    return () => clearInterval(iv)
  }, [pendingCorrections.data?.length])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ tasks: any[]; runs: any[] }>({ tasks: [], runs: [] })
  const [flagTarget, setFlagTarget] = useState<{ id: string; name: string } | null>(null)
  const [triggering, setTriggering] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'err'>>({})
  const [plan, setPlan] = useState<AgentPlan | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const triggerAgent = async (name: string) => {
    setTriggering(prev => ({ ...prev, [name]: 'loading' }))
    try {
      const res = await fetch('/api/trigger-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: name }),
      })
      setTriggering(prev => ({ ...prev, [name]: res.ok ? 'ok' : 'err' }))
    } catch {
      setTriggering(prev => ({ ...prev, [name]: 'err' }))
    }
    setTimeout(() => setTriggering(prev => ({ ...prev, [name]: 'idle' })), 2500)
  }

  useEffect(() => {
    supabase.from('agents').select('*').eq('active', true).order('pod').then(({ data }) => {
      setAgents((data as any) || [])
    })
  }, [])

  const selected = agents.find(a => a.id === selectedId) || agents[0] || null

  useEffect(() => {
    if (!selected) return
    // Selection changed — drop any in-progress edit so we don't carry stale state.
    setIsEditing(false)
    setSaveError(null)
    const load = async () => {
      // Agents may appear under id (`cleo`), display name (`Cleo`), or legacy `agent`
      // column on workflow_runs — match all to tolerate pre-migration rows and casing drift.
      const id = selected.id
      const name = selected.name
      const tokens = Array.from(new Set([id, id?.toLowerCase(), name, name?.toLowerCase()].filter(Boolean))) as string[]
      const inList = `(${tokens.map(t => `"${t}"`).join(',')})`

      const [tasks, runs, planRes] = await Promise.all([
        supabase.from('tasks').select('*').or(`owner.in.${inList},agent.in.${inList}`).neq('status', 'done').order('updated_at', { ascending: false }).limit(20),
        supabase.from('workflow_runs').select('*').in('agent_id', tokens).order('run_at', { ascending: false }).limit(10),
        supabase.from('agent_plans').select('*').eq('agent_id', id).maybeSingle(),
      ])

      const mergedRunsMap = new Map<string, any>()
      for (const r of ((runs.data as any) || [])) {
        if (r?.id) mergedRunsMap.set(r.id, r)
      }
      const mergedRuns = Array.from(mergedRunsMap.values()).sort((a, b) => {
        const ad = new Date(a.run_at || a.started_at || a.created_at || 0).getTime()
        const bd = new Date(b.run_at || b.started_at || b.created_at || 0).getTime()
        return bd - ad
      }).slice(0, 10)

      setDetail({ tasks: (tasks.data as any) || [], runs: mergedRuns })
      setPlan(((planRes as any).data as AgentPlan | null) ?? null)
    }
    load()
  }, [selected?.id])

  const startEdit = () => {
    setEditForm({
      brief_content: selected?.brief_content || '',
      objective: plan?.objective || '',
      current_phase: plan?.current_phase || '',
      next_milestone: plan?.next_milestone || '',
      progress_pct: typeof plan?.progress_pct === 'number' ? plan.progress_pct : 0,
    })
    setSaveError(null)
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    const pct = Number.isFinite(editForm.progress_pct)
      ? Math.max(0, Math.min(100, Math.round(editForm.progress_pct)))
      : 0
    try {
      const [agRes, plRes] = await Promise.all([
        supabase
          .from('agents')
          .update({ brief_content: editForm.brief_content })
          .eq('id', selected.id),
        supabase
          .from('agent_plans')
          .upsert(
            {
              agent_id: selected.id,
              objective: editForm.objective || null,
              current_phase: editForm.current_phase || null,
              next_milestone: editForm.next_milestone || null,
              progress_pct: pct,
            },
            { onConflict: 'agent_id' },
          ),
      ])
      if (agRes.error) throw agRes.error
      if (plRes.error) throw plRes.error
      // Reload so the read-only view reflects the saved changes.
      const [agAll, planAfter] = await Promise.all([
        supabase.from('agents').select('*').eq('active', true).order('pod'),
        supabase.from('agent_plans').select('*').eq('agent_id', selected.id).maybeSingle(),
      ])
      setAgents(((agAll.data as any) as Agent[]) || [])
      setPlan(((planAfter.data as any) as AgentPlan | null) ?? null)
      setIsEditing(false)
    } catch (e: any) {
      setSaveError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Group agents by pod, preserving POD_ORDER then alphabetical for unknown pods.
  const groups = useMemo(() => {
    const map = new Map<string, Agent[]>()
    for (const a of agents) {
      const k = (a.pod || 'unassigned').toLowerCase()
      const arr = map.get(k) || []
      arr.push(a)
      map.set(k, arr)
    }
    const knownKeys = POD_ORDER.filter(k => map.has(k))
    const extraKeys = Array.from(map.keys()).filter(k => !POD_ORDER.includes(k)).sort()
    return [...knownKeys, ...extraKeys].map(k => ({ pod: podOf(k), members: map.get(k)! }))
  }, [agents])

  const correctionsCount = pendingCorrections.data.length
  const topCorrection = pendingCorrections.data[0] || null
  const focusFirstCorrection = () => {
    if (!topCorrection) return
    const el = document.querySelector(`[data-correction-id="${topCorrection.id}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid rgba(245, 158, 11, 0.7)'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '8px'
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 3500)
    }
  }

  const list = (
    <div className="space-y-5 pr-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Organisation</h1>
          <p className="text-[11px] md:text-[12px] text-white/40 mt-0.5">Pod hierarchy — Executive sets direction, Ops runs the machine, Growth drives revenue.</p>
        </div>
        <p className="text-[11px] md:text-[12px] text-white/35 font-mono tabular-nums whitespace-nowrap">{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</p>
      </div>

      {pendingCorrections.data.length > 0 && (
        <PendingCorrectionsPanel
          corrections={pendingCorrections.data}
          loading={pendingCorrections.loading}
          onRefetch={pendingCorrections.refetch}
        />
      )}

      {groups.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] py-10 md:py-12 text-center">
          <p className="text-[13px] text-white/45">No active agents.</p>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(({ pod, members }) => (
          <PodSection
            key={pod.key}
            pod={pod}
            members={members}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            onFlag={(id, name) => setFlagTarget({ id, name })}
            onTrigger={triggerAgent}
            triggering={triggering}
          />
        ))}
      </div>
    </div>
  )

  const rightPanel = selected ? (
    <div className="space-y-5 md:space-y-6 pb-6">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={selected.id} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white leading-tight tracking-tight">{selected.name}</h1>
            <RunHealthDot runs={detail.runs} />
          </div>
          {selected.role && <p className="text-xs md:text-[13px] text-white/55 mt-1">{selected.role}</p>}
          <div className="flex items-center gap-3 mt-2">
            {selected.pod && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${podOf(selected.pod).chip}`}>
                {podOf(selected.pod).icon}
                {podOf(selected.pod).label}
              </span>
            )}
            {selected.last_run && (
              <span className="text-[10px] text-white/30">Last run {formatDistanceToNow(new Date(selected.last_run), { addSuffix: true })}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save Changes
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] text-white/65 border border-white/[0.08] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
              >
                <X size={12} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/10 text-violet-300 border border-violet-500/25 hover:bg-violet-500/20 transition-colors"
              >
                <Pencil size={12} /> Edit Plan & Identity
              </button>
              <button
                onClick={() => setFlagTarget({ id: selected.id, name: selected.name })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20 transition-colors"
              >
                <Zap size={12} /> Flag
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <IdentityPlanEditor form={editForm} onChange={setEditForm} saving={saving} error={saveError} />
      ) : (
        <>
          {selected.kpi_label && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/70 mb-2">{selected.kpi_label}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider">Target</p>
                  <p className="text-[13px] text-white/80 mt-0.5">{selected.kpi_target || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider">Current</p>
                  <p className="text-[13px] text-emerald-300/80 mt-0.5 font-medium">{selected.kpi_current || '—'}</p>
                </div>
              </div>
            </div>
          )}

          <PlanReadonly plan={plan} />

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">Active Tasks ({detail.tasks.length})</p>
            {detail.tasks.length === 0 ? (
              <p className="text-[11px] text-white/30">No active tasks.</p>
            ) : (
              <div className="space-y-1.5">
                {detail.tasks.slice(0, 8).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      t.status === 'waiting' ? 'bg-amber-400 animate-pulse' : t.status === 'active' ? 'bg-emerald-400' : t.status === 'in_progress' ? 'bg-blue-400' : 'bg-white/20'
                    }`} />
                    <p className="text-[12px] text-white/70 truncate flex-1">{t.title}</p>
                    <span className="text-[10px] text-white/30">{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">N8N Runs</p>
            {detail.runs.length === 0 ? (
              <p className="text-[11px] text-white/30">No workflow runs recorded.</p>
            ) : (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                {detail.runs.slice(0, 10).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2.5 text-[12px] gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.status === 'success' ? 'bg-emerald-400' : r.status === 'error' ? 'bg-rose-400' : 'bg-white/30'}`} />
                      <span className="text-white/70 truncate">{humanize(r.workflow_name) || r.workflow_name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {Number(r.cost_usd) > 0 && <span className="text-[10px] text-white/30 font-mono">${Number(r.cost_usd).toFixed(3)}</span>}
                      <span className="text-[10px] text-white/25">{r.run_at ? formatDistanceToNow(new Date(r.run_at), { addSuffix: true }) : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected.brief_content && <CollapsibleBrief content={selected.brief_content} agentId={selected.id} />}
        </>
      )}
    </div>
  ) : <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an agent</div>

  return (
    <div className="flex flex-col gap-4">
      <NextActionStrip
        headline={correctionsCount}
        headlineLabel="corrections"
        insight={topCorrection
          ? `Vera proposed a brief edit for ${topCorrection.agent_id}${topCorrection.pattern_reason_code ? ` (${topCorrection.pattern_reason_code})` : ''} — approve to ship`
          : `${agents.length} agent${agents.length === 1 ? '' : 's'} active · no correction patterns waiting`}
        ctaLabel={topCorrection ? 'Review correction' : 'View roster'}
        onCta={() => topCorrection ? focusFirstCorrection() : null}
        icon={AlertTriangle}
        accent={correctionsCount > 0 ? 'text-amber-300' : 'text-violet-300'}
        disabled={!topCorrection}
      />
      <SplitPane left={list} right={rightPanel} hasSelection={!!selectedId} onBack={() => setSelectedId(null)} leftWidth="45%" />
      {flagTarget && (
        <FlagAgentModal agentId={flagTarget.id} agentDisplayName={flagTarget.name} onClose={() => setFlagTarget(null)} />
      )}
    </div>
  )
}

function PodSection({ pod, members, selectedId, onSelect, onFlag, onTrigger, triggering }: { pod: PodDef; members: Agent[]; selectedId?: string; onSelect: (id: string) => void; onFlag: (id: string, name: string) => void; onTrigger: (name: string) => void; triggering: Record<string, 'idle' | 'loading' | 'ok' | 'err'> }) {
  return (
    <section className={`rounded-xl border ${pod.ring} bg-gradient-to-br ${pod.tint} p-3 md:p-4`}>
      <header className="flex items-center gap-2 mb-3 px-0.5">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border ${pod.chip}`}>
          {pod.icon}
        </span>
        <h3 className={`text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.18em] ${pod.accent}`}>{pod.label}</h3>
        <span className="text-[10px] font-mono tabular-nums text-white/30 ml-auto">{members.length}</span>
      </header>

      {pod.description && (
        <p className="text-[10.5px] md:text-[11px] text-white/35 leading-snug mb-3 px-0.5">{pod.description}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 md:gap-2.5">
        {members.map(a => {
          const isSel = selectedId === a.id
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`group text-left rounded-lg border p-2.5 md:p-3 transition-all min-h-[64px] ${
                isSel
                  ? 'border-violet-500/40 bg-violet-500/[0.08]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AgentAvatar agent={a.id} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] md:text-[13px] text-white font-semibold truncate">{a.name}</p>
                  {a.role && <p className="text-[10.5px] md:text-[11px] text-white/45 truncate">{a.role}</p>}
                  {a.last_run && (
                    <p className="text-[10px] text-white/25 mt-1 truncate">
                      Last run {formatDistanceToNow(new Date(a.last_run), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 self-start">
                  {a.expected_runs_per_day != null && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); if (triggering[a.name] !== 'loading') onTrigger(a.name) }}
                      className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
                        triggering[a.name] === 'ok' ? 'text-emerald-400 bg-emerald-500/10 opacity-100' :
                        triggering[a.name] === 'err' ? 'text-rose-400 bg-rose-500/10 opacity-100' :
                        'hover:bg-violet-500/10 text-white/25 hover:text-violet-400'
                      }`}
                      title={`Trigger ${a.name}`}
                    >
                      {triggering[a.name] === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    </span>
                  )}
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onFlag(a.id, a.name) }}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-amber-500/10 text-white/25 hover:text-amber-400 transition-all"
                    title={`Flag ${a.name}`}
                  >
                    <Zap size={12} />
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RunHealthDot({ runs }: { runs: any[] }) {
  if (!runs || runs.length === 0) {
    return <span className="w-2.5 h-2.5 rounded-full bg-white/15" title="No runs recorded" />
  }
  const recent = runs.slice(0, 5)
  const errorCount = recent.filter(r => r.status === 'error').length
  const color = errorCount === 0 ? 'bg-emerald-400' : errorCount <= 2 ? 'bg-amber-400' : 'bg-rose-500'
  const label = errorCount === 0 ? 'Healthy' : `${errorCount}/${recent.length} errors`
  return <span className={`w-2.5 h-2.5 rounded-full ${color}`} title={label} />
}

function PlanReadonly({ plan }: { plan: AgentPlan | null }) {
  if (!plan || (!plan.objective && !plan.current_phase && !plan.next_milestone && plan.progress_pct == null)) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400/70 mb-2">Plan</p>
        <p className="text-[11px] text-white/30 italic">No plan set yet. Click <span className="text-violet-300">Edit Plan &amp; Identity</span> to add one.</p>
      </div>
    )
  }
  const pct = typeof plan.progress_pct === 'number' ? Math.max(0, Math.min(100, plan.progress_pct)) : null
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400/70">Plan</p>
      {plan.objective && (
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">May KPI / Objective</p>
          <p className="text-[13px] text-white/85 mt-0.5 leading-relaxed">{plan.objective}</p>
        </div>
      )}
      {plan.current_phase && (
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">Current Phase</p>
          <p className="text-[13px] text-white/80 mt-0.5">{plan.current_phase}</p>
        </div>
      )}
      {plan.next_milestone && (
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">Next Milestone</p>
          <p className="text-[13px] text-white/80 mt-0.5">{plan.next_milestone}</p>
        </div>
      )}
      {pct !== null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Progress</p>
            <span className="text-[12px] font-mono tabular-nums text-white/60">{pct}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct >= 66 ? 'bg-emerald-400' : pct >= 33 ? 'bg-violet-400' : 'bg-amber-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function IdentityPlanEditor({ form, onChange, saving, error }: { form: EditForm; onChange: (next: EditForm) => void; saving: boolean; error: string | null }) {
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => onChange({ ...form, [key]: value })
  const inputCls = 'w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 py-2 text-[12.5px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/60 disabled:opacity-50'
  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Identity (brief_content)</p>
        <textarea
          value={form.brief_content}
          onChange={(e) => set('brief_content', e.target.value)}
          rows={14}
          disabled={saving}
          placeholder="Identity / brief_content…"
          className="w-full bg-black/30 border border-white/10 rounded p-2 text-[12px] text-white/85 leading-relaxed font-mono resize-y focus:outline-none focus:border-violet-500/60 disabled:opacity-50"
        />
      </div>

      {/* Plan */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400/70">Plan</p>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/45 block mb-1">May KPI / Objective</label>
          <input
            value={form.objective}
            onChange={(e) => set('objective', e.target.value)}
            disabled={saving}
            placeholder="e.g. Hit 1k MRR by end of May"
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/45 block mb-1">Current Phase</label>
          <input
            value={form.current_phase}
            onChange={(e) => set('current_phase', e.target.value)}
            disabled={saving}
            placeholder="e.g. Validation, Launch, Scale"
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/45 block mb-1">Next Milestone</label>
          <input
            value={form.next_milestone}
            onChange={(e) => set('next_milestone', e.target.value)}
            disabled={saving}
            placeholder="e.g. Ship onboarding flow"
            className={inputCls}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-white/45">Progress %</label>
            <span className="text-[11px] font-mono tabular-nums text-white/60">{form.progress_pct}%</span>
          </div>
          <input
            type="number"
            min={0}
            max={100}
            value={form.progress_pct}
            onChange={(e) => set('progress_pct', Number(e.target.value))}
            disabled={saving}
            className={inputCls}
          />
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  )
}

function PendingCorrectionsPanel({
  corrections,
  loading,
  onRefetch,
}: {
  corrections: PendingCorrection[]
  loading: boolean
  onRefetch: () => Promise<void>
}) {
  const [busy, setBusy] = useState<Record<string, 'idle' | 'approving' | 'rejecting' | 'ok' | 'err'>>({})
  const [errMsg, setErrMsg] = useState<Record<string, string>>({})

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(prev => ({ ...prev, [id]: action === 'approve' ? 'approving' : 'rejecting' }))
    setErrMsg(prev => ({ ...prev, [id]: '' }))
    try {
      const r = await fetch(`/api/corrections/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction_id: id }),
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || !payload.ok) throw new Error(payload.error || `HTTP ${r.status}`)
      setBusy(prev => ({ ...prev, [id]: 'ok' }))
      await onRefetch()
    } catch (e) {
      setBusy(prev => ({ ...prev, [id]: 'err' }))
      setErrMsg(prev => ({ ...prev, [id]: (e as Error).message }))
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-3 md:p-4">
      <header className="flex items-center gap-2 mb-3 px-0.5">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300">
          <AlertTriangle size={13} />
        </span>
        <h3 className="text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Pending corrections from Vera
        </h3>
        <span className="text-[10px] font-mono tabular-nums text-white/30 ml-auto">
          {loading ? '…' : corrections.length}
        </span>
      </header>
      <p className="text-[10.5px] md:text-[11px] text-white/45 leading-snug mb-3 px-0.5">
        Vera detected feedback patterns and proposed brief edits. Approve to append to the agent's identity, reject to dismiss.
      </p>
      <div className="space-y-2">
        {corrections.map(c => {
          const state = busy[c.id] || 'idle'
          return (
            <div key={c.id} data-correction-id={c.id} className="rounded-lg border border-amber-500/20 bg-white/[0.02] p-3">
              <div className="flex items-start gap-2 mb-2">
                <AgentAvatar agent={c.agent_id} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white capitalize">{c.agent_id}</p>
                  {c.pattern_reason_code && (
                    <p className="text-[10px] text-amber-200/80 mt-0.5">
                      Pattern: <span className="font-mono">{c.pattern_reason_code}</span>
                      {Array.isArray(c.consumed_feedback_ids) && c.consumed_feedback_ids.length > 0 && (
                        <span className="text-white/40"> · {c.consumed_feedback_ids.length} downvotes</span>
                      )}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-white/30 tabular-nums flex-shrink-0">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
              </div>
              {c.proposed_brief_edit && (
                <pre className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap bg-black/30 border border-white/[0.06] rounded p-2 max-h-40 overflow-auto font-mono">
                  {c.proposed_brief_edit}
                </pre>
              )}
              {errMsg[c.id] && (
                <p className="text-[10px] text-rose-400 mt-1.5">{errMsg[c.id]}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2.5">
                <button
                  onClick={() => act(c.id, 'approve')}
                  disabled={state === 'approving' || state === 'rejecting' || state === 'ok'}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {state === 'approving' ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
                  Approve
                </button>
                <button
                  onClick={() => act(c.id, 'reject')}
                  disabled={state === 'approving' || state === 'rejecting' || state === 'ok'}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/[0.04] text-white/60 border border-white/[0.08] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                >
                  {state === 'rejecting' ? <Loader2 size={11} className="animate-spin" /> : <ThumbsDown size={11} />}
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CollapsibleBrief({ content, agentId }: { content: string, agentId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [liveContent, setLiveContent] = useState(content)

  // Reset draft if the server-supplied content changes (e.g. a different agent is selected)
  React.useEffect(() => {
    setLiveContent(content)
    if (!editing) setDraft(content)
  }, [content, agentId])

  const hasMore = liveContent.length > 200
  const preview = liveContent.slice(0, 200)

  const persist = async (body: { brief_content: string }) => {
    const resp = await fetch('/api/sync-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, ...body })
    })
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}))
      throw new Error(j.error || `HTTP ${resp.status}`)
    }
    return resp.json()
  }

  const triggerSync = async () => {
    setSyncing(true)
    setSynced(false)
    try {
      // Re-trigger sync without changing content. PATCHes brief_updated_at and enqueues sync_queue.
      // poll_sync_queue.py picks it up within 60s and runs render-identity.py.
      await persist({ brief_content: liveContent })
      setSyncing(false)
      setSynced(true)
      setTimeout(() => setSynced(false), 3000)
    } catch (e) {
      setSyncing(false)
      setSaveError((e as Error).message)
    }
  }

  const startEdit = () => {
    setDraft(liveContent)
    setSaveError(null)
    setEditing(true)
    setExpanded(true)
  }

  const cancelEdit = () => {
    setDraft(liveContent)
    setEditing(false)
    setSaveError(null)
  }

  const saveEdit = async () => {
    if (draft.trim().length === 0) {
      setSaveError('Brief content cannot be empty.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      // Save: PATCHes agents.brief_content + enqueues sync_queue.
      // poll_sync_queue.py renders SKILL.md from the new brief_content.
      await persist({ brief_content: draft })
      setLiveContent(draft)
      setEditing(false)
      setSynced(true)
      setTimeout(() => setSynced(false), 3000)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 hover:text-white/60 transition-colors"
        >
          Identity {expanded ? '▾' : '▸'}
        </button>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[10px] font-medium text-white/60 transition-colors"
              title="Edit brief_content directly. Saves to Supabase, render-identity.py writes SKILL.md."
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[10px] font-medium text-emerald-300 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[10px] font-medium text-white/60 transition-colors disabled:opacity-50"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </>
          )}
          {!editing && (
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[10px] font-medium text-white/60 transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cog className="w-3 h-3" />}
              {synced ? 'Deployed' : 'Deploy Identity'}
            </button>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(30, Math.max(10, draft.split('\n').length + 2))}
            className="w-full bg-black/30 border border-white/10 rounded p-2 text-[11px] text-white/80 leading-relaxed font-mono resize-y focus:outline-none focus:border-violet-500/60"
            disabled={saving}
            placeholder="Edit the agent's Identity (brief_content). This becomes SKILL.md after save + sync."
          />
        ) : (
          <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">
            {expanded || !hasMore ? liveContent : preview + '…'}
          </p>
        )}
        {!editing && hasMore && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-[10px] text-violet-400 hover:text-violet-300 mt-1.5">
            Show full Identity
          </button>
        )}
        {saveError && (
          <p className="text-[10px] text-rose-400 mt-2">{saveError}</p>
        )}
      </div>
    </div>
  )
}
