import React, { useEffect, useMemo, useState } from 'react'
import { isToday, isPast, parseISO } from 'date-fns'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState } from './primitives'
import { DetailSheet } from './DetailSheet'
import { BottomSheet } from './BottomSheet'
import { useRealtimeTasks, type TaskRow } from '../../hooks/useRealtimeTasks'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { supabase, logKrishAction } from '../../lib/supabase'
import { humanAge } from '../../lib/ageHelpers'
import { DecisionsWaitingPanel } from '../DecisionsWaitingPanel'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'

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

function urgencyAccent(t: TaskRow): 'red' | 'amber' | 'violet' | 'neutral' {
  if (t.due_date && isPast(parseISO(t.due_date)) && t.status !== 'done') return 'red'
  if (t.priority === 'pri-1' || t.priority_override === 1) return 'amber'
  if (t.status === 'waiting') return 'violet'
  return 'neutral'
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
  const { tasks: allTasks, loading } = useRealtimeTasks()
  const tasks = useMemo(
    () => (lane ? allTasks.filter(t => matchesLane(t, lane)) : allTasks),
    [allTasks, lane],
  )
  const [openId, setOpenId] = useState<string | null>(null)
  const [showStale, setShowStale] = useState(false)

  const { due, waiting, pipeline, stale, hero } = useMemo(() => {
    const visible: TaskRow[] = []
    const staleArr: TaskRow[] = []
    for (const t of tasks) {
      if (isDoneish(t)) continue
      if (isNoise(t)) continue
      if (isStale(t)) { staleArr.push(t); continue }
      visible.push(t)
    }
    const due = visible.filter(t =>
      t.due_date &&
      (isToday(parseISO(t.due_date)) || isPast(parseISO(t.due_date))) &&
      t.status !== 'done'
    )
    const waiting = visible.filter(t => t.status === 'waiting' && !due.includes(t))
    const pipeline = visible.filter(t =>
      (t.status === 'active' || t.status === 'in_progress') && !due.includes(t)
    )

    const hero =
      due.find(t => t.status === 'waiting') ||
      due[0] ||
      waiting[0] ||
      pipeline[0] ||
      null

    return { due, waiting, pipeline, stale: staleArr, hero }
  }, [tasks])

  const open = openId ? tasks.find(t => t.id === openId) ?? null : null

  const supersede = async (id: string) => {
    h.heavy()
    try {
      await supabase.from('tasks').update({ status: 'superseded' }).eq('id', id)
      await logKrishAction(id, 'superseded')
      h.success()
      toast('Dismissed.', 'success')
      setOpenId(null)
    } catch {
      h.error()
      toast('Could not dismiss.', 'error')
    }
  }

  const markDone = async (id: string, agent?: string) => {
    h.heavy()
    try {
      await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id)
      await logKrishAction(id, 'done', agent)
      h.success()
      toast('Done.', 'success')
      setOpenId(null)
    } catch {
      h.error()
      toast('Could not mark done.', 'error')
    }
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Today"
          subtitle={loading ? 'Loading…' : `${due.length} due · ${waiting.length} waiting on you`}
        />
      }
    >
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
      <div className="px-3">
        <DecisionsWaitingPanel onNavigate={onNavigate} filterable />
      </div>
      {hero && (
        <HeroCard
          eyebrow={hero.agent ? `Needs you · ${hero.agent}` : 'Needs you'}
          accent={urgencyAccent(hero)}
          title={hero.title}
          detail={hero.next_step || hero.description}
          meta={hero.due_date ? `Due ${humanDue(hero.due_date)}` : humanAge(hero.updated_at)}
          cta="Open"
          onClick={() => { h.select(); setOpenId(hero.id) }}
        />
      )}

      <div className="flex gap-3 flex-shrink-0">
        <StatPill label="Due" value={due.length} color={due.length > 0 ? 'text-red-300' : 'text-white/45'} />
        <StatPill label="Waiting" value={waiting.length} color={waiting.length > 0 ? 'text-amber-300' : 'text-white/45'} />
        <StatPill label="Pipeline" value={pipeline.length} color="text-white/85" />
      </div>

      {due.length === 0 && waiting.length === 0 && pipeline.length === 0 && !loading && (
        <EmptyState label="Inbox zero. Nothing needs you right now." />
      )}

      {due.length > 0 && (
        <FeedCard title={`Due today · ${due.length}`}>
          {due.slice(0, 6).map(t => (
            <FeedRow
              key={t.id}
              dotColor="bg-red-400"
              title={t.title}
              detail={t.next_step || undefined}
              trailing={<span className="text-[14px] text-white/40">{humanDue(t.due_date)}</span>}
              onClick={() => { h.select(); setOpenId(t.id) }}
              feedback={{ sourceTable: "tasks", sourceId: t.id, agentId: t.agent || t.owner }}
            />
          ))}
        </FeedCard>
      )}

      {waiting.length > 0 && (
        <FeedCard title={`Waiting on you · ${waiting.length}`}>
          {waiting.slice(0, 8).map(t => (
            <FeedRow
              key={t.id}
              dotColor="bg-amber-400"
              title={t.title}
              detail={t.next_step || undefined}
              trailing={<span className="text-[14px] text-white/35 tabular-nums">{humanAge(t.updated_at)}</span>}
              onClick={() => { h.select(); setOpenId(t.id) }}
              feedback={{ sourceTable: "tasks", sourceId: t.id, agentId: t.agent || t.owner }}
            />
          ))}
        </FeedCard>
      )}

      {pipeline.length > 0 && (
        <FeedCard title={`In flight · ${pipeline.length}`}>
          {pipeline.slice(0, 6).map(t => (
            <FeedRow
              key={t.id}
              dotColor="bg-violet-400"
              title={t.title}
              detail={t.agent ? `${t.agent}${t.next_step ? ' · ' + t.next_step : ''}` : t.next_step || undefined}
              trailing={<span className="text-[14px] text-white/35 tabular-nums">{humanAge(t.updated_at)}</span>}
              onClick={() => { h.select(); setOpenId(t.id) }}
              feedback={{ sourceTable: "tasks", sourceId: t.id, agentId: t.agent || t.owner }}
            />
          ))}
        </FeedCard>
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
                { label: 'Mark done', variant: 'primary', onClick: () => markDone(open.id, open.agent) },
                { label: 'Dismiss as superseded', variant: 'danger', onClick: () => supersede(open.id) },
              ]
            : []
        }
      />

      <BottomSheet
        open={!!decision}
        onClose={() => onClearDecision?.()}
        ariaLabel="Decision detail"
      >
        {decision && (
          <DecisionDetail decision={decision} onClose={() => onClearDecision?.()} />
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
