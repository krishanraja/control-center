import React, { useState, useMemo, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { InlineActions } from '../InlineActions'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'
import { StatusPill } from '../shared/StatusPill'

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'waiting',     label: 'Needs You' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'active',      label: 'Active' },
  { id: 'blocked',     label: 'Blocked' },
  { id: 'done',        label: 'Done' },
]

export function DesktopPlans() {
  const { tasks, loading } = useRealtimeTasks()
  const [filter, setFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let t = tasks.filter(x => {
      const agent = (x.agent || '').toLowerCase()
      const title = (x.title || '').toLowerCase()
      const gl = (x.group_label || '').toLowerCase()
      
      // Filter out BD signals - they clutter the Plans view
      // BD signals come from: zara, bd-agent, or have "signal" in group_label/title
      if (agent === 'zara' || agent === 'bd-agent') return false
      if (gl.includes('signal') || gl.includes('bd')) return false
      if (title.startsWith('bd signal:') || title.startsWith('bd:')) return false
      
      return true
    })
    if (filter === 'waiting') t = t.filter(x => x.status === 'waiting' || !x.krish_reviewed)
    else if (filter !== 'all') t = t.filter(x => x.status === filter)
    return t
  }, [tasks, filter])

  const selected = tasks.find(t => t.id === selectedId) || filtered[0] || null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!filtered.length) return
      const idx = selected ? filtered.findIndex(t => t.id === selected.id) : -1
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filtered[Math.min(filtered.length - 1, idx + 1)]
        if (next) setSelectedId(next.id)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = filtered[Math.max(0, idx - 1)]
        if (prev) setSelectedId(prev.id)
      } else if (selected && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        supabase.from('tasks').update({ status: 'active', krish_reviewed: true, updated_at: new Date().toISOString() }).eq('id', selected.id)
      } else if (selected && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        supabase.from('tasks').update({ status: 'done', krish_reviewed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, selected?.id])

  const list = (
    <div className="space-y-4 pr-2">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight">Plans</h1>
        <p className="text-[12px] text-white/35 font-mono tabular-nums">{filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}</p>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
              filter === f.id
                ? 'bg-violet-500/15 border-violet-500/35 text-white'
                : 'border-white/[0.08] text-white/45 hover:text-white/75 hover:border-white/[0.14]'
            }`}
          >{f.label}</button>
        ))}
      </div>
      <div className="space-y-1.5">
        {loading && <p className="text-[12px] text-white/30 py-6 text-center">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] py-12 flex flex-col items-center justify-center text-center">
            <svg className="w-6 h-6 text-white/15 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-[13px] text-white/45">No tasks match this filter</p>
            <p className="text-[11px] text-white/25 mt-1">Try selecting a different filter above</p>
          </div>
        )}
        {filtered.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className={`w-full text-left rounded-lg border p-3.5 transition-all ${
              selected?.id === t.id
                ? 'border-violet-500/40 bg-violet-500/[0.07]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot(t.status)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white font-medium leading-snug truncate">{t.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AgentAvatar agent={t.agent || t.owner || 'system'} size="sm" />
                  <span className="text-[11px] text-white/50">{t.agent || t.owner}</span>
                  {t.updated_at && <span className="text-[10px] text-white/25">· {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const detail = selected ? <TaskDetail key={selected.id} task={selected} /> : (
    <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select a task</div>
  )

  return <SplitPane left={list} right={detail} hasSelection={!!selectedId} onBack={() => setSelectedId(null)} />
}

function statusDot(status?: string) {
  switch (status) {
    case 'active':      return 'bg-emerald-400'
    case 'in_progress': return 'bg-blue-400'
    case 'waiting':     return 'bg-amber-400 animate-pulse'
    case 'blocked':     return 'bg-rose-400'
    case 'done':        return 'bg-white/25'
    default:            return 'bg-white/20'
  }
}

function TaskDetail({ task }: { task: TaskRow }) {
  const [notes, setNotes] = useState(task.krish_notes || '')
  const [nextStep, setNextStep] = useState(task.next_step || '')

  const saveNotes = async () => {
    if (notes === (task.krish_notes || '')) return
    await supabase.from('tasks').update({ krish_notes: notes, krish_reviewed: true, updated_at: new Date().toISOString() }).eq('id', task.id)
  }
  const saveNextStep = async () => {
    if (nextStep === (task.next_step || '')) return
    await supabase.from('tasks').update({ next_step: nextStep, updated_at: new Date().toISOString() }).eq('id', task.id)
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-lg md:text-xl font-semibold text-white leading-tight tracking-tight">{task.title}</h1>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <StatusPill status={(task.status === 'waiting' ? 'needs_you' : task.status) as any} />
          <span className="text-[11px] text-white/40">
            Owner: <span className="text-white/70">{task.owner || 'Unassigned'}</span>
          </span>
          {task.agent && task.agent !== task.owner && (
            <span className="text-[11px] text-white/40">Agent: <span className="text-white/70">{task.agent}</span></span>
          )}
          {task.group_label && <span className="text-[11px] text-white/40">· {task.group_label}</span>}
        </div>
      </div>

      {task.description && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Description</p>
          <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Next Step</p>
        <textarea
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          onBlur={saveNextStep}
          rows={3}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-violet-500/40"
        />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Krish Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Notes for the team..."
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-violet-500/40 placeholder-white/20"
        />
      </div>

      <div className="flex items-center gap-3">
        <InlineActions taskId={task.id} currentStatus={task.status} />
      </div>

      <div className="text-[11px] text-white/30 space-x-3">
        {task.created && <span>Created {formatDistanceToNow(new Date(task.created), { addSuffix: true })}</span>}
        {task.updated_at && <span>· Updated {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>}
      </div>
    </div>
  )
}
