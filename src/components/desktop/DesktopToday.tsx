import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow, isToday, isPast, parseISO } from 'date-fns'
import { ExternalLink, Archive, ChevronRight, Clock, MoreHorizontal } from 'lucide-react'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { InlineActions } from '../InlineActions'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'
import { useToast } from '../shared/Toast'
import { NextActionStrip } from '../shared/NextActionStrip'
import { BackburnerSection } from '../shared/BackburnerSection'
import { PipelineQueue, PIPELINE_WORKSTREAMS } from './PipelineQueue'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

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
  // Legacy URL guard: `#/today?decision=<kind>:<id>` should redirect non-task kinds
  // to their canonical tab (idea→content, guest/visibility→guests, lead→leads).
  // Tasks continue to use the inline DecisionDetail split-pane.
  useEffect(() => {
    if (!decision) return
    const [kind, ...rest] = decision.split(':')
    const id = rest.join(':')
    if (!kind || !id) return
    if (kind === 'task') return
    if (kind === 'idea' || kind === 'guest' || kind === 'visibility' || kind === 'lead') {
      onClearDecision?.()
      navigateDecision(onNavigate, kind, id)
    }
  }, [decision, onClearDecision, onNavigate])

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
    const buried: TaskRow[] = []
    for (const t of tasks) {
      if (isSupersededOrDone(t)) continue
      if (t.buried_at) { buried.push(t); continue }
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
    return { due, waiting, stale, buried }
  }, [tasks])

  const items: TaskRow[] = [...today.due, ...today.waiting]
  const selected = tasks.find(t => t.id === selectedId) || items[0] || null

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the grouped
  // list regroups into the 3 daily-target lanes via relevance_index (table
  // 'tasks'). One uniform row renderer feeds both the lanes and the muted set,
  // reusing DayRow and selectTask so a lane row selects the task in the detail
  // pane exactly like the normal list.
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const visibleTasks: TaskRow[] = [...today.due, ...today.waiting]
  const renderTaskRow = (t: TaskRow) => (
    <DayRow task={t} selected={selected?.id === t.id} onClick={() => selectTask(t.id)} />
  )

  // Next action: the most overdue task (earliest due_date) if any are overdue,
  // else the first due-today task, else nothing.
  const nextActionTask = useMemo(() => {
    const overdue = today.due
      .filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    return overdue[0] || today.due[0] || today.waiting[0] || null
  }, [today.due, today.waiting])

  const overdueCount = today.due.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))).length
  const insight = nextActionTask
    ? overdueCount > 0
      ? `${today.due.length} due, ${overdueCount} overdue — start with "${nextActionTask.title}"`
      : `${today.due.length} due today, ${today.waiting.length} waiting on you`
    : 'Inbox zero for today. Pipeline below.'

  const list = (
    <div className="space-y-4 pr-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Today</h1>
          <p className="text-xs md:text-[13px] text-white/50 mt-0.5">Only what's due, waiting on you, or next in the pipeline. New inbound proposals live in Triage.</p>
        </div>
        {isFocusModeEnabled() && calibrated && (
          <FocusModeToggle mode={mode} onChange={setMode} />
        )}
      </div>
      <NextActionStrip
        headline={today.due.length}
        headlineLabel="due"
        insight={insight}
        ctaLabel={nextActionTask ? 'Open' : 'All clear'}
        onCta={() => nextActionTask && selectTask(nextActionTask.id)}
        icon={Clock}
        accent={overdueCount > 0 ? 'text-rose-300' : 'text-violet-300'}
        disabled={!nextActionTask}
      />
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

      {showFocus ? (
        <FocusLanes
          rows={visibleTasks}
          table="tasks"
          keyOf={t => String(t.id)}
          renderItem={renderTaskRow}
          fallback={null}
          mutedLabel="Off focus"
        />
      ) : (
        <>
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

          <BackburnerSection
            table="tasks"
            items={today.buried.map(t => ({ id: t.id, title: t.title, buried_reason: t.buried_reason }))}
          />

          {items.length === 0 && !loading && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-10 md:p-12 text-center">
              <p className="text-sm md:text-[14px] text-white/55 font-medium">Nothing scheduled for today.</p>
              <p className="text-xs md:text-[12px] text-white/30 mt-1">Clear mind.</p>
            </div>
          )}
        </>
      )}
    </div>
  )

  // After an action removes the selected item, advance to its neighbour so the
  // user can keep triaging without re-clicking the list.
  const selectNextAfter = (id: string) => {
    const idx = items.findIndex(t => t.id === id)
    const next = items[idx + 1] || items[idx - 1] || null
    selectTask(next && next.id !== id ? next.id : null)
  }

  const detail = decision
    ? <DecisionDetail key={decision} decision={decision} onClose={onClearDecision} actionsEnabled />
    : selected
      ? <TodayDetail key={selected.id} task={selected} onActioned={() => selectNextAfter(selected.id)} />
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

  const bulk = async (action: 'dismiss_superseded' | 'snooze_30d', failMsg: string, okMsg: (n: number) => string) => {
    const ids = tasks.map(t => t.id)
    try {
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, notes: `Bulk: ${ids.length} stale (>${STALE_DAYS}d) items` }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      toast(okMsg(ids.length), 'success')
    } catch {
      toast(failMsg, 'error')
    }
  }

  const dismissAll = () => bulk('dismiss_superseded', 'Could not bulk-dismiss — try again.', n => `Dismissed ${n} stale items.`)
  // Inline snooze replaces what KillListModal used to ask weekly. Push due_date
  // out 30 days so the items fall off Today without losing their work history.
  const snoozeAll = () => bulk('snooze_30d', 'Could not snooze — try again.', n => `Snoozed ${n} for 30 days.`)

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
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); snoozeAll() }}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/10 text-white/55 hover:bg-white/[0.06] transition-colors"
            >
              Snooze 30d
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dismissAll() }}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-rose-500/20 text-rose-300 hover:bg-rose-500/10 transition-colors"
            >
              Dismiss all
            </button>
          </span>
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

function TodayDetail({ task, onActioned }: { task: TaskRow; onActioned?: () => void }) {
  const { toast } = useToast()
  const [notes, setNotes] = useState(task.krish_notes || '')
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const agentName = task.agent || task.owner || 'system'

  const post = async (
    action: string,
    extra: Record<string, any> = {},
    opts: { advance?: boolean; success?: string } = {},
  ) => {
    if (busy) return
    setBusy(true)
    setMoreOpen(false)
    try {
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, action, agent: agentName, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      if (opts.success) toast(opts.success, 'success')
      if (opts.advance) onActioned?.()
    } catch (err) {
      toast(`Could not save — ${err instanceof Error ? err.message : 'try again'}.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveNotes = () => {
    if (notes === (task.krish_notes || '')) return
    post('note', { notes })
  }

  const moreItems: Array<{ label: string; danger?: boolean; run: () => void }> = [
    { label: 'Mark Done', run: () => post('done', {}, { advance: true, success: 'Marked done.' }) },
    { label: 'Needs Revision', run: () => post('revision', { notes: notes || 'Needs revision' }, { success: 'Revision requested.' }) },
    { label: 'Add to Tomorrow', run: () => post('push_tomorrow', {}, { advance: true, success: 'Moved to tomorrow.' }) },
    { label: 'Dismiss as superseded', danger: true, run: () => post('dismiss_superseded', {}, { advance: true, success: 'Dismissed as superseded.' }) },
  ]

  const hasWhy = !!(task.description || task.evidence || task.lever_score != null || task.tier || task.workstream)

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white leading-tight tracking-tight">{task.title}</h1>
        <div className="flex items-center gap-2 mt-2 text-[11px] text-white/45">
          <AgentAvatar agent={agentName} size="sm" />
          <span className="text-white/70">{agentName}</span>
          {task.updated_at && <span>· {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>}
        </div>
      </div>

      {hasWhy && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-white/35">Why {agentName} flagged this</p>
          {task.description && (
            <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}
          {task.evidence && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Evidence</p>
              <p className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap">{task.evidence}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.lever_score != null && <WhyChip label={`Lever ${task.lever_score}/10`} />}
            {task.tier && <WhyChip label={`Tier ${task.tier}`} />}
            {task.workstream && <WhyChip label={String(task.workstream)} />}
            {task.priority && <WhyChip label={String(task.priority)} />}
          </div>
          {task.link_secondary && (
            <a href={task.link_secondary} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-violet-300 hover:text-violet-200">
              <ExternalLink size={12} />
              Source
            </a>
          )}
        </div>
      )}

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

      <div className="flex items-center gap-2">
        <InlineActions taskId={task.id} currentStatus={task.status} agent={agentName} onSuccess={onActioned} />
        <div className="relative">
          <button
            onClick={() => setMoreOpen(o => !o)}
            disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] text-[11px] font-medium disabled:opacity-40"
          >
            <MoreHorizontal size={11} />
            More
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
              <div className="absolute left-0 bottom-full mb-1 z-40 w-52 rounded-lg border border-white/10 bg-[#141417] shadow-xl py-1">
                {moreItems.map(item => (
                  <button
                    key={item.label}
                    onClick={item.run}
                    disabled={busy}
                    className={`w-full text-left px-3 py-2 text-[12px] disabled:opacity-40 hover:bg-white/[0.06] ${
                      item.danger ? 'text-rose-300' : 'text-white/75'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function WhyChip({ label }: { label: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03] text-white/55 capitalize">
      {label}
    </span>
  )
}
