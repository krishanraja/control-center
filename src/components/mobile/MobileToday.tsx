import React, { useEffect, useMemo, useState } from 'react'
import { isToday, isPast, parseISO } from 'date-fns'
import { Mic } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader, FeedCard, FeedRow } from './primitives'
import { MobileTabSkeleton } from '../shared/Skeleton'
import { AllClear } from '../shared/AllClear'
import { DetailSheet } from './DetailSheet'
import { BottomSheet } from './BottomSheet'
import { useRealtimeTasks, type TaskRow } from '../../hooks/useRealtimeTasks'
import { useDictation } from '../../hooks/useDictation'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { BackburnerSection } from '../shared/BackburnerSection'
import { ProcessingOverlay } from '../shared/ProcessingOverlay'
import { humanAge } from '../../lib/ageHelpers'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

// Mirrors the desktop noise/stale filters in DesktopToday so the two surfaces
// agree on what counts as "today".
const STALE_DAYS = 14
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000
const NOISE_TITLE: RegExp[] = [
  /^\s*health alert:\s*0\s*down,\s*0\s*stale/i,
  /^\s*sync engine running every/i,
]

function isStale(t: TaskRow): boolean {
  if (t.started_at) return false
  if (!t.updated_at) return false
  const ms = Date.now() - new Date(t.updated_at).getTime()
  if (!Number.isFinite(ms) || ms < STALE_MS) return false
  return t.status === 'active' || t.status === 'waiting' || t.status === 'new'
}
function isNoise(t: TaskRow): boolean {
  return !!t.title && NOISE_TITLE.some(re => re.test(t.title))
}
function isDoneish(t: TaskRow): boolean {
  return t.status === 'superseded' || t.status === 'done' || t.status === 'closed'
}

// Mirrors DesktopToday: the day queue is the decisions_waiting task branch
// (statuses an agent parks on Krish, unreviewed, not buried). Everything else
// non-terminal is agent-carried and collapses to one ambient sentence.
const QUEUE_STATUSES = new Set(['waiting', 'in_progress', 'blocked', 'new'])
// A deferred task (future due_date) is off the plate until its date arrives.
function deferredToLater(t: TaskRow): boolean {
  if (!t.due_date) return false
  const startOfTomorrow = new Date(); startOfTomorrow.setHours(24, 0, 0, 0)
  return new Date(t.due_date).getTime() >= startOfTomorrow.getTime()
}
function needsKrish(t: TaskRow): boolean {
  return QUEUE_STATUSES.has(t.status) && !t.krish_reviewed && !deferredToLater(t)
}
function isDueNow(t: TaskRow): boolean {
  if (!t.due_date) return false
  const d = parseISO(t.due_date)
  return isToday(d) || isPast(d)
}
// Coarse sitting math, same spirit as minutesToZero in decisionKinds.
function minutesLeft(remaining: number): number {
  return Math.max(1, Math.round(remaining * 0.75))
}
type DeferChoice = 'tomorrow' | 'monday' | 'next_week'
function deferDateISO(choice: DeferChoice): string {
  const d = new Date()
  if (choice === 'tomorrow') d.setDate(d.getDate() + 1)
  else if (choice === 'monday') d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7))
  else d.setDate(d.getDate() + 7)
  return d.toISOString()
}

function urgencyAccent(t: TaskRow): 'red' | 'amber' | 'violet' | 'neutral' {
  if (t.due_date && isPast(parseISO(t.due_date)) && t.status !== 'done') return 'red'
  if (t.priority === 'pri-1' || t.priority_override === 1) return 'amber'
  if (t.status === 'waiting') return 'violet'
  return 'neutral'
}

function cardAccent(t: TaskRow): string {
  const a = urgencyAccent(t)
  if (a === 'red') return 'border-red-400/25 bg-red-400/[0.04]'
  if (a === 'amber') return 'border-amber-400/25 bg-amber-400/[0.04]'
  if (a === 'violet') return 'border-violet-400/25 bg-violet-400/[0.04]'
  return 'border-white/[0.08] bg-white/[0.02]'
}

// Thumb-zone button, same grammar as the content decision deck.
function Big({ children, tone = 'ghost', onClick, disabled }: {
  children: string; tone?: 'primary' | 'green' | 'ghost'; onClick: () => void; disabled?: boolean
}) {
  const cls = tone === 'green' ? 'bg-emerald-400 text-emerald-950'
    : tone === 'primary' ? 'btn-contrast'
    : 'bg-white/[0.06] text-white/75 border border-white/10'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl py-3.5 text-[13.5px] font-bold disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  )
}

interface MobileTodayProps {
  lane?: string | null
  onClearLane?: () => void
  decision?: string | null
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  onClearDecision?: () => void
}

function matchesLane(t: TaskRow, lane: string | null): boolean {
  if (!lane) return true
  const agent = (t.agent || '').toLowerCase()
  const ws = (t.workstream || '').toLowerCase()
  if (lane === 'content') return agent === 'cleo' || ws === 'content'
  if (lane === 'visibility') return agent === 'nova' || ws === 'visibility'
  if (lane === 'leads') return agent === 'felix' || agent === 'maya' || ws === 'leads'
  return true
}

export function MobileToday({
  lane = null,
  onClearLane,
  decision = null,
  onNavigate,
  onClearDecision,
}: MobileTodayProps = {}) {
  // Legacy URL guard: non-task decision params redirect to their canonical tab
  // so Today never shows generic detail for idea/guest/visibility/lead.
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

  const h = useHaptics()
  const { toast } = useToast()
  const { tasks: allTasks, loading, refresh } = useRealtimeTasks()
  const tasks = useMemo(
    () => (lane ? allTasks.filter(t => matchesLane(t, lane)) : allTasks),
    [allTasks, lane],
  )
  const [openId, setOpenId] = useState<string | null>(null)
  const [showStale, setShowStale] = useState(false)
  const [taskBusy, setTaskBusy] = useState(false)
  // Set-based ledger: optimistic removal + a numerator that cannot double-count.
  const [committed, setCommitted] = useState<Set<string>>(() => new Set())
  const decided = committed.size
  const [sendBackFor, setSendBackFor] = useState<TaskRow | null>(null)
  const [deferFor, setDeferFor] = useState<TaskRow | null>(null)
  const [note, setNote] = useState('')
  // Dictation-first: the one-thumb contract means the mic leads and the
  // keyboard only appears when summoned. Transcripts append to the note.
  const dictation = useDictation(text => setNote(n => (n ? `${n} ${text}` : text)))
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'

  const { queue, carried, stale, buried } = useMemo(() => {
    const visible: TaskRow[] = []
    const staleArr: TaskRow[] = []
    const buried: TaskRow[] = []
    for (const t of tasks) {
      if (isDoneish(t)) continue
      if (t.buried_at) { buried.push(t); continue }
      if (isNoise(t)) continue
      if (isStale(t)) { staleArr.push(t); continue }
      visible.push(t)
    }
    // Overdue and due-today rows lead (earliest first); the rest keep cache
    // order (updated_at desc), same as desktop.
    const queued = visible.filter(needsKrish).filter(t => !committed.has(t.id))
    const dueNow = queued
      .filter(isDueNow)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    const queue = [...dueNow, ...queued.filter(t => !isDueNow(t))]
    const carried = visible.filter(t => !needsKrish(t))
    return { queue, carried, stale: staleArr, buried }
  }, [tasks, committed])

  const current = queue[0] || null
  const total = queue.length + decided
  const open = openId ? tasks.find(t => t.id === openId) ?? null : null

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the queue
  // regroups into the 3 daily-target lanes via relevance_index (table 'tasks').
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderTaskRow = (t: TaskRow) => {
    const accent = urgencyAccent(t)
    const dot = accent === 'red' ? 'bg-red-400' : accent === 'amber' ? 'bg-amber-400' : accent === 'violet' ? 'bg-violet-400' : 'bg-white/30'
    return (
      <FeedRow
        dotColor={dot}
        title={t.title}
        detail={t.next_step || t.agent || undefined}
        trailing={<span className="text-[14px] text-white/35 tabular-nums">{t.due_date ? humanDue(t.due_date) : humanAge(t.updated_at)}</span>}
        onClick={() => { h.select(); setOpenId(t.id) }}
        feedback={{ sourceTable: 'tasks', sourceId: t.id, agentId: t.agent || t.owner }}
      />
    )
  }

  // Task writes go through service-role APIs; the anon client can't update
  // tasks under RLS (matches 0 rows without erroring, so the old direct
  // updates flashed success while the item stayed put).
  const taskAction = async (
    payload: Record<string, any>,
    okMsg: string,
    failMsg: string,
    opts: { decided?: boolean } = {},
  ) => {
    if (taskBusy) return
    h.heavy()
    setTaskBusy(true)
    try {
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      h.success()
      toast(okMsg, 'success')
      if (opts.decided) setCommitted(prev => { const n = new Set(prev); n.add(payload.id); return n })
      setOpenId(null)
      setSendBackFor(null)
      setDeferFor(null)
      setNote('')
      refresh()
    } catch {
      h.error()
      toast(failMsg, 'error')
    } finally {
      setTaskBusy(false)
    }
  }

  const approve = (t: TaskRow) =>
    taskAction({ id: t.id, action: 'approve', agent: t.agent || t.owner }, 'Approved.', 'Could not approve.', { decided: true })
  const sendBack = (t: TaskRow, notes: string) =>
    taskAction(
      { id: t.id, action: 'send_back', agent: t.agent || t.owner, notes },
      `Sent back to ${t.agent || t.owner || 'the agent'}.`,
      'Could not send back.',
      { decided: true },
    )
  const defer = (t: TaskRow, choice: DeferChoice) =>
    taskAction(
      { id: t.id, action: 'defer', agent: t.agent || t.owner, due_date: deferDateISO(choice) },
      'Deferred.',
      'Could not defer.',
      { decided: true },
    )
  const supersede = (id: string, agent?: string) =>
    taskAction({ id, action: 'dismiss_superseded', agent }, 'Dismissed.', 'Could not dismiss.')

  const openSendBack = (t: TaskRow) => { h.select(); setOpenId(null); setNote(''); setSendBackFor(t) }
  const openDefer = (t: TaskRow) => { h.select(); setOpenId(null); setDeferFor(t) }

  // First paint loads single-focus: one card, shimmering in. On a phone you
  // arrived to make one decision, so the placeholder is that shape.
  if (loading && allTasks.length === 0) {
    return (
      <MobileShellPrim header={<TabHeader title="Today" subtitle="Gathering your day…" />}>
        <MobileTabSkeleton />
      </MobileShellPrim>
    )
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Today"
          subtitle={loading ? 'Loading…' : queue.length > 0 ? `${queue.length} to decide` : 'The day is decided'}
        />
      }
    >
      {taskBusy && <ProcessingOverlay label="Updating" sub="Saving your decision" />}
      {lane && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-violet-500/10 border border-violet-400/20 rounded-lg text-sm">
          <span className="text-violet-200">Filtered to {lane}</span>
          <button
            onClick={() => onClearLane?.()}
            className="ml-auto text-white/60 hover:text-white text-xs px-3 py-2 rounded-md min-h-[44px] inline-flex items-center"
          >
            Show all
          </button>
        </div>
      )}

      {isFocusModeEnabled() && calibrated && (
        <div className="flex items-center justify-end -mt-1">
          <FocusModeToggle mode={mode} onChange={setMode} />
        </div>
      )}

      {showFocus ? (
        <FeedCard title="Today, by focus">
          <FocusLanes
            rows={queue}
            table="tasks"
            keyOf={(t) => String(t.id)}
            renderItem={renderTaskRow}
            fallback={null}
            mutedLabel="Off focus"
          />
        </FeedCard>
      ) : current ? (
        <div className="flex flex-col">
          {/* progress */}
          <div className="px-1 pb-3">
            {total > 20 ? (
              // Segments with fixed gaps stop fitting past ~20 items: one
              // continuous track with a filled ratio carries the same read.
              <div className="h-[3px] rounded-full bg-white/10 mb-2 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round((decided / Math.max(total, 1)) * 100)}%` }} />
              </div>
            ) : (
              <div className="flex gap-1 mb-2">
                {Array.from({ length: total || 1 }, (_, i) => (
                  <span key={i} className={`h-[3px] flex-1 rounded-full ${i < decided ? 'bg-emerald-400' : 'bg-white/10'}`} />
                ))}
              </div>
            )}
            <div className="text-[11px] text-white/40 tabular-nums">
              {decided} of {total} decided · about {minutesLeft(queue.length)} min left
            </div>
          </div>

          {/* the one card */}
          <div className={`rounded-2xl border p-5 ${cardAccent(current)}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold bg-white/[0.06] text-white/60 capitalize">
                {current.agent || current.owner || 'system'}
              </span>
              {isDueNow(current) && (
                <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold bg-red-400/15 text-red-300">
                  Due {humanDue(current.due_date)}
                </span>
              )}
            </div>
            <h3 className="text-[16.5px] font-bold text-white mt-3 leading-snug">{current.title}</h3>
            {(current.next_step || current.description) && (
              <p className="text-[12.5px] text-white/50 mt-2 leading-relaxed line-clamp-4">
                {current.next_step || current.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3 text-[11px] text-white/40 tabular-nums flex-wrap">
              <span>waiting {humanAge(current.updated_at) || 'just now'}</span>
              {current.lever_score != null && <span>· lever {current.lever_score}/10</span>}
            </div>
            <button
              onClick={() => { h.select(); setOpenId(current.id) }}
              className="mt-3 text-[12px] text-white/45 underline underline-offset-2 active:text-white/70"
            >
              Full detail
            </button>
          </div>

          {/* thumb zone */}
          <div className="pt-4 pb-2 flex flex-col gap-2">
            <Big tone="green" disabled={taskBusy} onClick={() => approve(current)}>Approve</Big>
            <Big disabled={taskBusy} onClick={() => openSendBack(current)}>Send back with a note</Big>
            <Big disabled={taskBusy} onClick={() => openDefer(current)}>Defer</Big>
          </div>
        </div>
      ) : !loading ? (
        <AllClear
          title="The day is decided."
          sub="Nothing is waiting on your ruling. New asks land here as the agents raise them."
        />
      ) : null}

      {carried.length > 0 && (
        <p className="text-[12px] text-white/40 text-center px-4">
          Agents are carrying {carried.length} {carried.length === 1 ? 'task' : 'tasks'} themselves; none need you.
        </p>
      )}

      {stale.length > 0 && (
        <FeedCard
          title={`Hidden · ${stale.length} stale`}
          action={
            <button
              onClick={() => { h.tap(); setShowStale(s => !s) }}
              className="text-[13px] text-white/55 active:text-white"
            >
              {showStale ? 'Hide' : 'Show'}
            </button>
          }
        >
          {showStale && stale.map(t => (
            <FeedRow
              key={t.id}
              dotColor="bg-white/15"
              title={t.title}
              detail={`Untouched ${humanAge(t.updated_at)}`}
              trailing={
                <button
                  onClick={(e) => { e.stopPropagation(); supersede(t.id) }}
                  className="text-[13px] text-red-300 font-semibold px-3 py-1.5 rounded-full bg-red-500/10 active:bg-red-500/20 inline-flex items-center min-h-[44px] min-w-[44px] justify-center"
                >
                  Drop
                </button>
              }
              onClick={() => { h.select(); setOpenId(t.id) }}
              feedback={{ sourceTable: "tasks", sourceId: t.id, agentId: t.agent || t.owner }}
            />
          ))}
        </FeedCard>
      )}

      <BackburnerSection
        table="tasks"
        items={buried.map(t => ({ id: t.id, title: t.title, buried_reason: t.buried_reason }))}
      />

      <DetailSheet
        open={open != null}
        onClose={() => setOpenId(null)}
        eyebrow={open?.agent ? `${open.agent} · ${open.workstream || 'task'}` : open?.workstream}
        title={open?.title || ''}
        body={open?.description || open?.next_step || undefined}
        agent={open?.agent}
        status={open?.status}
        meta={open?.due_date ? `Due ${humanDue(open.due_date)}` : (open?.updated_at ? humanAge(open.updated_at) : undefined)}
        docUrl={open?.link_primary || undefined}
        actions={
          open
            ? [
                { label: 'Approve', variant: 'primary', onClick: () => approve(open) },
                { label: 'Send back with a note', variant: 'secondary', onClick: () => openSendBack(open) },
                { label: 'Defer', variant: 'secondary', onClick: () => openDefer(open) },
              ]
            : []
        }
      />

      {/* Send back with a note: dictation-first, textarea fallback. */}
      <BottomSheet
        open={!!sendBackFor}
        onClose={() => { dictation.stop(); setSendBackFor(null); setNote('') }}
        fullHeight={false}
        ariaLabel="Send back with a note"
      >
        {sendBackFor && (
          <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">
                Send back to {sendBackFor.agent || sendBackFor.owner || 'the agent'}
              </p>
              <h3 className="text-[16px] font-bold text-white mt-1 leading-snug">{sendBackFor.title}</h3>
            </div>
            <div className="flex items-start gap-2">
              {dictation.supported && (
                <button
                  onClick={() => { h.tap(); dictation.toggle() }}
                  aria-label={dictation.listening ? 'Stop dictation' : 'Dictate your note'}
                  className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${
                    dictation.listening
                      ? 'bg-rose-500/20 border-rose-400/40 text-rose-300 animate-pulse'
                      : 'bg-white/[0.06] border-white/10 text-white/70 active:bg-white/[0.1]'
                  }`}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={dictation.supported ? 'Tap the mic and say why, or type...' : 'Tell the agent what to change...'}
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[15px] text-white/85 focus:outline-none focus:border-violet-500/40 placeholder-white/25"
              />
            </div>
            <Big tone="primary" disabled={taskBusy || !note.trim()} onClick={() => sendBack(sendBackFor, note.trim())}>
              Send back
            </Big>
          </div>
        )}
      </BottomSheet>

      {/* Defer: three honest date choices, no calendar spelunking. */}
      <BottomSheet
        open={!!deferFor}
        onClose={() => setDeferFor(null)}
        fullHeight={false}
        ariaLabel="Defer to a date"
      >
        {deferFor && (
          <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">Defer</p>
              <h3 className="text-[16px] font-bold text-white mt-1 leading-snug">{deferFor.title}</h3>
            </div>
            <div className="flex flex-col gap-2">
              <Big tone="primary" disabled={taskBusy} onClick={() => defer(deferFor, 'tomorrow')}>Tomorrow</Big>
              <Big disabled={taskBusy} onClick={() => defer(deferFor, 'monday')}>Monday</Big>
              <Big disabled={taskBusy} onClick={() => defer(deferFor, 'next_week')}>Next week</Big>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!decision}
        onClose={() => onClearDecision?.()}
        ariaLabel="Decision detail"
      >
        {decision && (
          <DecisionDetail decision={decision} onClose={() => onClearDecision?.()} actionsEnabled />
        )}
      </BottomSheet>
    </MobileShellPrim>
  )
}

function humanDue(iso?: string | null): string {
  if (!iso) return ''
  try {
    const d = parseISO(iso)
    if (isToday(d)) return 'today'
    if (isPast(d)) {
      const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
      return days === 0 ? 'today' : `${days}d overdue`
    }
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
    return `in ${days}d`
  } catch {
    return ''
  }
}
