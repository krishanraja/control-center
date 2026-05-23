import React, { useMemo, useState } from 'react'
import { formatDistanceToNow, isToday, isPast, parseISO } from 'date-fns'
import { ExternalLink, Archive, ChevronRight } from 'lucide-react'
import { supabase, logKrishAction } from '../../lib/supabase'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { InlineActions } from '../InlineActions'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'
import { useToast } from '../shared/Toast'
import { PipelineQueue, PIPELINE_WORKSTREAMS } from './PipelineQueue'
import { DecisionsWaitingPanel } from '../DecisionsWaitingPanel'
import { DecisionDetail } from '../DecisionDetail'

const PIPELINE_WORKSTREAM_SET = new Set<string>(PIPELINE_WORKSTREAMS as readonly string[])

// Stale threshold for the Today auto-collapse. Tasks not touched for this many
// days, with no progress, hide behind a single "N stale items hidden" disclosure.
const STALE_DAYS = 14
const STALE_THRESHOLD_MS = STALE_DAYS * 24 * 60 * 60 * 1000

// Health-alert noise that Marcus's prompt sometimes collapses into the
// "Top blockers" string. We filter these patterns out client-side so they
// don't surface as actionable items. The Marcus prompt patch is the
// source-side fix; this is defence in depth.
const NOISE_TITLE_PATTERNS: RegExp[] = [
  /^\s*health alert:\s*0\s*down,\s*0\s*stale/i,
  /^\s*sync engine running every/i,
]

function isStaleNoProgress(t: TaskRow): boolean {
  if (t.started_at) return false
  if (!t.updated_at) return false
  const updated = new Date(t.updated_at).getTime()
  if (!Number.isFinite(updated)) return false
  if (Date.now() - updated < STALE_THRESHOLD_MS) return false
  return t.status === 'active' || t.status === 'waiting' || t.status === 'new'
}

function isNoiseTask(t: TaskRow): boolean {
  if (!t.title) return false
  return NOISE_TITLE_PATTERNS.some(re => re.test(t.title))
}

function isSupersededOrDone(t: TaskRow): boolean {
  return t.status === 'superseded' || t.status === 'done' || t.status === 'closed'
}

interface Props {
  selectedTaskId?: string | null
  onSelectTask?: (id: string | null) => void
  lane?: string | null
  onClearLane?: () => void
  decision?: string | null
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  onClearDecision?: () => void
}

function matchesLane(t: TaskRow, lane: string | null): boolean {
  if (!lane) return true
  const agent = (t.agent || '').toLowerCase()
  const workstream = (t.workstream || '').toLowerCase()
  if (lane === 'content') return agent === 'cleo' || workstream === 'content'
  if (lane === 'visibility') return agent === 'nova' || workstream === 'visibility'
  if (lane === 'leads') return agent === 'felix' || agent === 'maya' || workstream === 'leads'
  return true
}

export function DesktopToday({
  selectedTaskId,
  onSelectTask,
  lane = null,
  onClearLane,
  decision = null,
  onNavigate,
  onClearDecision,
}: Props = {}) {
  const { tasks: allTasks, loading } = useRealtimeTasks()
  const tasks = useMemo(
    () => (lane ? allTasks.filter(t => matchesLane(t, lane)) : allTasks),
    [allTasks, lane],
  )
  // Fallback to local state when the URL hasn't specified a task yet — preserves
  // the prior "first item auto-selected" behavior for direct visits to /today.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlControlled = selectedTaskId !== undefined
  const selectedId = urlControlled ? (selectedTaskId ?? null) : localSelectedId

  const selectTask = (id: string | null) => {
    if (urlControlled) onSelectTask?.(id)
    else setLocalSelectedId(id)
  }

  const today = useMemo(() => {
    // Pre-filter: hide superseded/done, hide noise patterns, defer stale items
    // to the collapsed bucket. The user complaint was that the Today list
    // surfaced "Configure ListenNotes API…" (29 days untouched) and
    // "Health alert: 0 down, 0 stale" (Marcus noise). This fixes both.
    const visible: TaskRow[] = []
    const stale: TaskRow[] = []
    for (const t of tasks) {
      if (isSupersededOrDone(t)) continue
      if (isNoiseTask(t)) continue
      if (isStaleNoProgress(t)) { stale.push(t); continue }
      visible.push(t)
    }

    const due = visible.filter(t => t.due_date && (isToday(parseISO(t.due_date)) || isPast(parseISO(t.due_date))) && t.status !== 'done')
    const waiting = visible.filter(t =>
      t.status === 'waiting'
      && !due.find(d => d.id === t.id)
      && !(t.workstream && PIPELINE_WORKSTREAM_SET.has(t.workstream))
    )
    return { due, waiting, stale }
  }, [tasks])

  const items: TaskRow[] = [...today.due, ...today.waiting]
  const selected = tasks.find(t => t.id === selectedId) || items[0] || null

  const list = (
    <div className="space-y-4 pr-2">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Today</h1>
        <p className="text-xs md:text-[13px] text-white/50 mt-0.5">Everything that needs you.</p>
      </div>
      <DecisionsWaitingPanel onNavigate={onNavigate} filterable />
      {lane && (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-400/20 rounded-lg text-sm">
          <span className="text-violet-200">Filtered to {lane}</span>
          <button
            onClick={() => onClearLane?.()}
            className="ml-auto text-white/60 hover:text-white text-xs"
          >
            Show all
          </button>
        </div>
      )}
      {loading && <p className="text-[12px] text-white/30">Loading…</p>}

      {today.due.length > 0 && (
        <Group title="Due" count={today.due.length} accent="text-rose-400">
          {today.due.map(t => <DayRow key={t.id} task={t} selected={selected?.id === t.id} onClick={() => selectTask(t.id)} />)}
        </Group>
      )}

      {today.waiting.length > 0 && (
        <Group title="Waiting on You" count={today.waiting.length} accent="text-amber-400">
          {today.waiting.map(t => <DayRow key={t.id} task={t} selected={selected?.id === t.id} onClick={() => selectTask(t.id)} />)}
        </Group>
      )}

      <PipelineQueue />

      {today.stale.length > 0 && (
        <StaleDisclosure tasks={today.stale} onSelectTask={selectTask} selectedId={selected?.id || null} />
      )}

      {items.length === 0 && !loading && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-10 md:p-12 text-center">
          <p className="text-sm md:text-[14px] text-white/55 font-medium">Nothing scheduled for today.</p>
          <p className="text-xs md:text-[12px] text-white/30 mt-1">Clear mind.</p>
        </div>
      )}
    </div>
  )

  const detail = decision
    ? <DecisionDetail key={decision} decision={decision} onClose={onClearDecision} />
    : selected
      ? <TodayDetail key={selected.id} task={selected} />
      : <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an item from your day</div>

  const onBack = () => {
    if (decision) onClearDecision?.()
    else selectTask(null)
  }

  return <SplitPane left={list} right={detail} hasSelection={!!selectedId || !!decision} onBack={onBack} />
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
          <div className="flex items-center gap-2 overflow-hidden">
            <p className="text-[13px] text-white font-medium leading-snug truncate">{task.title}</p>
            {!task.weekly_goal_id && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium uppercase tracking-wide flex-shrink-0">Drift</span>}
          </div>
          {task.next_step && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-1">{task.next_step}</p>}
        </div>
      </div>
    </button>
  )
}

function StaleDisclosure({
  tasks, onSelectTask, selectedId,
}: {
  tasks: TaskRow[]
  onSelectTask: (id: string | null) => void
  selectedId: string | null
}) {
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const dismissAll = async () => {
    const ids = tasks.map(t => t.id)
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) {
      toast('Could not bulk-dismiss — try again.', 'error')
      return
    }
    for (const id of ids) {
      await logKrishAction(id, 'dismiss_superseded', undefined, `Bulk-dismiss: ${tasks.length} stale (>${STALE_DAYS}d) items`)
    }
    toast(`Dismissed ${ids.length} stale items.`, 'success')
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <ChevronRight
          size={11}
          className={`text-white/40 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Archive size={11} className="text-white/35" />
        <span className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.14em]">
          Stale ({tasks.length})
        </span>
        <span className="text-[10px] text-white/35 ml-1">no progress in {STALE_DAYS}+ days</span>
        {open && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismissAll() }}
            className="ml-auto px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/10 text-white/55 hover:bg-white/[0.06] transition-colors"
          >
            Dismiss all
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
          {tasks.slice(0, 30).map(t => (
            <DayRow
              key={t.id}
              task={t}
              selected={selectedId === t.id}
              onClick={() => onSelectTask(t.id)}
            />
          ))}
          {tasks.length > 30 && (
            <div className="px-3 py-2 text-[10px] text-white/35 text-center">
              +{tasks.length - 30} more (collapse or open Plans for full triage)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TodayDetail({ task }: { task: TaskRow }) {
  const { toast } = useToast()
  const [notes, setNotes] = useState(task.krish_notes || '')
  const [dismissing, setDismissing] = useState(false)
  const saveNotes = async () => {
    if (notes === (task.krish_notes || '')) return
    await supabase.from('tasks').update({ krish_notes: notes, krish_reviewed: true, updated_at: new Date().toISOString() }).eq('id', task.id)
    await logKrishAction(task.id, 'note', task.agent || task.owner, notes)
  }
  const pushTomorrow = async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await supabase.from('tasks').update({ due_date: tomorrow.toISOString(), updated_at: new Date().toISOString() }).eq('id', task.id)
    await logKrishAction(task.id, 'push_tomorrow', task.agent || task.owner)
  }
  const dismissSuperseded = async () => {
    if (dismissing) return
    setDismissing(true)
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('id', task.id)
    if (error) {
      toast('Could not dismiss — try again.', 'error')
      setDismissing(false)
      return
    }
    await logKrishAction(task.id, 'dismiss_superseded', task.agent || task.owner, 'Dismissed from Today as superseded')
    toast('Dismissed as superseded.', 'success')
    setDismissing(false)
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
    await logKrishAction(task.id, 'revision', task.agent || task.owner, notes || 'Needs revision')
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white leading-tight tracking-tight">{task.title}</h1>
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

      {task.link_primary && (
        <a href={task.link_primary} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] text-violet-300 hover:bg-violet-500/10 text-[13px] font-medium transition-colors w-fit">
          <ExternalLink size={14} />
          Open Document
        </a>
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
        <InlineActions taskId={task.id} currentStatus={task.status} agent={task.agent || task.owner} />
        <button onClick={submitRevision} className="px-2.5 py-1.5 rounded-lg border border-amber-500/25 text-amber-400 hover:bg-amber-500/10 text-[11px] font-medium">Needs Revision</button>
        <button onClick={pushTomorrow} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] text-[11px] font-medium">Add to Tomorrow</button>
        <button
          onClick={dismissSuperseded}
          disabled={dismissing}
          className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/45 hover:text-white/75 hover:bg-white/[0.06] text-[11px] font-medium disabled:opacity-40 ml-auto"
          title="Hide this task — the underlying need no longer exists (e.g. replaced tool)"
        >
          Dismiss as superseded
        </button>
      </div>
    </div>
  )
}
