import React, { useState, useMemo } from 'react'
import { formatDistanceToNow, isToday, isPast, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { InlineActions } from '../InlineActions'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'

export function DesktopToday() {
  const { tasks, loading } = useRealtimeTasks()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const today = useMemo(() => {
    const due = tasks.filter(t => t.due_date && (isToday(parseISO(t.due_date)) || isPast(parseISO(t.due_date))) && t.status !== 'done')
    const waiting = tasks.filter(t => t.status === 'waiting' && !due.find(d => d.id === t.id))
    return { due, waiting }
  }, [tasks])

  const items: TaskRow[] = [...today.due, ...today.waiting]
  const selected = tasks.find(t => t.id === selectedId) || items[0] || null

  const list = (
    <div className="space-y-4 pr-2">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Today</h1>
        <p className="text-[13px] text-white/35">Everything that needs you</p>
      </div>
      {loading && <p className="text-[12px] text-white/30">Loading…</p>}

      {today.due.length > 0 && (
        <Group title="Due" count={today.due.length} accent="text-rose-400">
          {today.due.map(t => <DayRow key={t.id} task={t} selected={selected?.id === t.id} onClick={() => setSelectedId(t.id)} />)}
        </Group>
      )}

      {today.waiting.length > 0 && (
        <Group title="Waiting on You" count={today.waiting.length} accent="text-amber-400">
          {today.waiting.map(t => <DayRow key={t.id} task={t} selected={selected?.id === t.id} onClick={() => setSelectedId(t.id)} />)}
        </Group>
      )}

      {items.length === 0 && !loading && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-8 text-center text-[13px] text-white/30">
          Nothing scheduled for today. Clear mind.
        </div>
      )}
    </div>
  )

  const detail = selected ? <TodayDetail key={selected.id} task={selected} /> : (
    <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an item from your day</div>
  )

  return <SplitPane left={list} right={detail} hasSelection={!!selectedId} onBack={() => setSelectedId(null)} />
}

function Group({ title, count, accent, children }: { title: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${accent.replace('text-', 'border-')}/25 bg-white/[0.03]`}>{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function DayRow({ task, selected, onClick }: { task: TaskRow; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? 'border-violet-500/40 bg-violet-500/[0.06]'
          : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-start gap-2">
        <AgentAvatar agent={task.agent || task.owner || 'system'} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white font-medium leading-snug truncate">{task.title}</p>
          {task.next_step && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-1">{task.next_step}</p>}
        </div>
      </div>
    </button>
  )
}

function TodayDetail({ task }: { task: TaskRow }) {
  const [notes, setNotes] = useState(task.krish_notes || '')
  const saveNotes = async () => {
    if (notes === (task.krish_notes || '')) return
    await supabase.from('tasks').update({ krish_notes: notes, krish_reviewed: true, updated_at: new Date().toISOString() }).eq('id', task.id)
  }
  const pushTomorrow = async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await supabase.from('tasks').update({ due_date: tomorrow.toISOString(), updated_at: new Date().toISOString() }).eq('id', task.id)
  }
  const submitRevision = async () => {
    await supabase.from('corrections').insert({
      agent_id: task.agent || task.owner,
      original_output: task.next_step || task.title,
      correction_instruction: notes || 'Needs revision',
      detection_source: 'krish-control-center',
      correction_type: 'revision_request',
      status: 'pending',
    })
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-lg md:text-xl font-bold text-white leading-tight">{task.title}</h1>
        <div className="flex items-center gap-2 mt-2 text-[11px] text-white/45">
          <AgentAvatar agent={task.agent || task.owner || 'system'} size="sm" />
          <span className="text-white/70">{task.agent || task.owner}</span>
          {task.updated_at && <span>· {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>}
        </div>
      </div>

      {task.next_step && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Next Step</p>
          <p className="text-[13px] text-white/75 leading-relaxed">{task.next_step}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Your Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Thoughts, decisions, context..."
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-violet-500/40 placeholder-white/20"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <InlineActions taskId={task.id} currentStatus={task.status} />
        <button onClick={submitRevision} className="px-2.5 py-1.5 rounded-lg border border-amber-500/25 text-amber-400 hover:bg-amber-500/10 text-[11px] font-medium">Needs Revision</button>
        <button onClick={pushTomorrow} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] text-[11px] font-medium">Add to Tomorrow</button>
      </div>
    </div>
  )
}
