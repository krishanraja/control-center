import React, { useMemo, useState } from 'react'
import { ExternalLink, ThumbsUp, MessageSquarePlus, ChevronRight, Users } from 'lucide-react'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { useNellCandidates, type NellCandidate } from '../../hooks/useNellCandidates'
import { AgentAvatar } from '../shared/AgentAvatar'
import { PipelineCard } from '../PipelineCard'
import { PipelineLane } from './PipelineLane'
import { supabase, logKrishAction } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import {
  CONTENT_STAGES, LEADS_STAGES, VISIBILITY_STAGES,
  rollupTasks, pickFeaturedContent, draftPreview,
} from '../../lib/pipelines'
import type { TaskRow } from '../../hooks/useRealtimeTasks'
import { ageDays, ageTone, humanAge, AGE_TONE_CLASS } from '../../lib/ageHelpers'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

interface Props {
  onNavigate?: NavigateFn
}

/**
 * The three-lane row that leads Home. Content is primary (leftmost, 2x
 * width) because Krish acts on it daily and the featured card needs vertical
 * space for the inline draft preview.
 *
 * No new realtime channels: tasks come from the shared `tasks-rt-shared`
 * cache (ADR-002); nell_candidates is polled.
 */
export function PipelineLanes({ onNavigate }: Props) {
  const { tasks } = useRealtimeTasks()
  const { candidates } = useNellCandidates()
  const rollup = useMemo(() => rollupTasks(tasks), [tasks])

  // Pending Nell candidates — Nell drafts that haven't been promoted yet.
  const pendingNell = useMemo(
    () => candidates.filter(c => (c.status ?? 'new') === 'new'),
    [candidates],
  )

  const openInToday = (taskId: string) => onNavigate?.('today', { task: taskId })

  return (
    <div
      className="
        grid grid-cols-1 gap-3
        md:grid-cols-2
        xl:[grid-template-columns:2fr_1fr_1fr]
      "
    >
      <ContentLane rollup={rollup.content} onOpenTask={openInToday} onNavigate={onNavigate} />
      <LeadsLane rollup={rollup.leads} onOpenTask={openInToday} onNavigate={onNavigate} />
      <VisibilityLane
        rollup={rollup.visibility}
        pendingNell={pendingNell}
        onOpenTask={openInToday}
        onNavigate={onNavigate}
      />
    </div>
  )
}

// ─── Content lane (primary, 2fr, featured Approve card) ─────────────────────

function ContentLane({
  rollup, onOpenTask, onNavigate,
}: {
  rollup: ReturnType<typeof rollupTasks>['content']
  onOpenTask: (id: string) => void
  onNavigate?: NavigateFn
}) {
  const featured = useMemo(() => pickFeaturedContent(rollup), [rollup])
  const compactRows = useMemo(() => {
    const review = rollup.byStage.review || []
    const drafting = rollup.byStage.drafting || []
    const approved = rollup.byStage.approved || []
    const pool = [...review, ...drafting, ...approved].filter(t => t.id !== featured?.id)
    return pool.slice(0, 2)
  }, [rollup, featured])

  const stageCounts: Record<string, number> = {}
  for (const s of CONTENT_STAGES) stageCounts[s.key] = (rollup.byStage[s.key] || []).length

  return (
    <PipelineLane
      pipeline="content"
      total={rollup.total}
      stages={CONTENT_STAGES}
      stageCounts={stageCounts}
      onOpenAll={() => onNavigate?.('plans', { workstream: 'content' })}
    >
      <div className="flex flex-col gap-2">
        {featured && (
          <FeaturedContentCard task={featured} onOpenTask={onOpenTask} />
        )}
        {compactRows.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04] mt-1">
            {compactRows.map(t => (
              <PipelineCard key={t.id} task={t} onOpen={onOpenTask} />
            ))}
          </div>
        )}
      </div>
    </PipelineLane>
  )
}

/**
 * Krish's named "one-click I wish I had" — Approve a Content draft with the
 * preview visible inline. No expand step. Three buttons (Approve, Revise via
 * note, Open doc) all live on the card surface.
 */
function FeaturedContentCard({
  task: t, onOpenTask,
}: {
  task: TaskRow
  onOpenTask: (id: string) => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | 'approve' | 'note'>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  const days = ageDays(t.updated_at)
  const toneClass = AGE_TONE_CLASS[ageTone(days)]
  const preview = draftPreview(t)

  const approve = async () => {
    setBusy('approve')
    const { error } = await supabase.from('tasks').update({
      status: 'active',
      krish_reviewed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', t.id)
    if (error) {
      toast('Could not approve — try again.', 'error')
    } else {
      await logKrishAction(t.id, 'approve', t.agent)
      toast('Approved.', 'success')
    }
    setBusy(null)
  }

  const submitNote = async () => {
    if (!noteText.trim()) { setNoteOpen(false); return }
    setBusy('note')
    const { error } = await supabase.from('tasks').update({
      krish_notes: noteText.trim(),
      krish_reviewed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', t.id)
    if (error) {
      toast('Could not save note — try again.', 'error')
    } else {
      await logKrishAction(t.id, 'note', t.agent, noteText.trim())
      toast('Revisions requested.', 'success')
      setNoteText('')
      setNoteOpen(false)
    }
    setBusy(null)
  }

  return (
    <article className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3">
      <header className="flex items-start gap-2 min-w-0">
        <AgentAvatar agent={t.agent || 'system'} size="sm" />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onOpenTask(t.id)}
            className="text-left w-full"
          >
            <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">{t.title}</p>
          </button>
          {preview && (
            <p className="text-[11px] text-white/55 leading-snug mt-1 line-clamp-3">{preview}</p>
          )}
        </div>
        <span className={`text-[10px] tabular-nums flex-shrink-0 ${toneClass}`}>
          {humanAge(t.updated_at)}
        </span>
      </header>

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); approve() }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 transition-colors"
        >
          <ThumbsUp size={11} />
          Approve
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setNoteOpen(v => !v) }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
        >
          <MessageSquarePlus size={11} />
          Request revisions
        </button>
        {t.link_primary && (
          <a
            href={t.link_primary}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Open doc
          </a>
        )}
      </div>

      {noteOpen && (
        <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNote()}
            placeholder="What needs to change?"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-2 py-1 text-[11px] text-white placeholder-white/25 focus:outline-none focus:border-violet-500/40"
          />
          <button
            type="button"
            onClick={submitNote}
            disabled={busy !== null}
            className="px-2.5 py-1 rounded-md bg-violet-500/20 border border-violet-500/30 text-[11px] text-violet-200 hover:bg-violet-500/30 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
    </article>
  )
}

// ─── Leads lane (1fr, compact rows) ─────────────────────────────────────────

function LeadsLane({
  rollup, onOpenTask, onNavigate,
}: {
  rollup: ReturnType<typeof rollupTasks>['leads']
  onOpenTask: (id: string) => void
  onNavigate?: NavigateFn
}) {
  const stageCounts: Record<string, number> = {}
  for (const s of LEADS_STAGES) stageCounts[s.key] = (rollup.byStage[s.key] || []).length

  const topItems = useMemo(() => {
    // Surface the items most likely to need a click: contacted then drafted
    // (active work), then conversation (in-flight). Closed buried.
    const ordered = [
      ...(rollup.byStage.contacted || []),
      ...(rollup.byStage.drafted || []),
      ...(rollup.byStage.conversation || []),
    ]
    return ordered
      .sort((a, b) => {
        const au = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return au - bu
      })
      .slice(0, 3)
  }, [rollup])

  return (
    <PipelineLane
      pipeline="leads"
      total={rollup.total}
      stages={LEADS_STAGES}
      stageCounts={stageCounts}
      onOpenAll={() => onNavigate?.('plans', { workstream: 'leads' })}
    >
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
        {topItems.map(t => (
          <PipelineCard
            key={t.id}
            task={t}
            onOpen={onOpenTask}
            meta={<LeadMeta task={t} />}
          />
        ))}
      </div>
    </PipelineLane>
  )
}

function LeadMeta({ task: t }: { task: TaskRow }) {
  const chips: React.ReactNode[] = []
  if (t.contact_company) {
    chips.push(
      <span key="co" className="text-[10px] text-white/55 truncate max-w-[120px]">{t.contact_company}</span>,
    )
  }
  if (typeof t.icp_score === 'number' && t.icp_score > 0) {
    chips.push(
      <span key="icp" className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 tabular-nums">
        ICP {t.icp_score}
      </span>,
    )
  }
  if (t.tier) {
    chips.push(
      <span key="tier" className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-white/55 uppercase tracking-[0.1em]">
        {t.tier}
      </span>,
    )
  }
  if (chips.length === 0) return null
  return <>{chips}</>
}

// ─── Visibility lane (1fr, Nell header + task stages) ───────────────────────

function VisibilityLane({
  rollup, pendingNell, onOpenTask, onNavigate,
}: {
  rollup: ReturnType<typeof rollupTasks>['visibility']
  pendingNell: NellCandidate[]
  onOpenTask: (id: string) => void
  onNavigate?: NavigateFn
}) {
  const stageCounts: Record<string, number> = {}
  for (const s of VISIBILITY_STAGES) stageCounts[s.key] = (rollup.byStage[s.key] || []).length

  const topItems = useMemo(() => {
    const pool = [
      ...(rollup.byStage.pitch_drafted || []),
      ...(rollup.byStage.outreach_sent || []),
    ]
    return pool
      .sort((a, b) => {
        const au = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return au - bu
      })
      .slice(0, 2)
  }, [rollup])

  const combinedTotal = rollup.total + pendingNell.length
  // The lane is "empty" only when no tasks AND no Nell candidates.
  const laneEmpty = combinedTotal === 0

  return (
    <PipelineLane
      pipeline="visibility"
      total={combinedTotal}
      stages={VISIBILITY_STAGES}
      stageCounts={stageCounts}
      onOpenAll={() => onNavigate?.('plans', { workstream: 'visibility' })}
      emptyLabel={laneEmpty ? 'Nothing in motion.' : undefined}
    >
      <div className="flex flex-col gap-2">
        {pendingNell.length > 0 && (
          <NellCandidatesHeader candidates={pendingNell} onOpenTask={onOpenTask} />
        )}
        {topItems.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
            {topItems.map(t => (
              <PipelineCard key={t.id} task={t} onOpen={onOpenTask} />
            ))}
          </div>
        )}
      </div>
    </PipelineLane>
  )
}

function NellCandidatesHeader({
  candidates, onOpenTask,
}: {
  candidates: NellCandidate[]
  onOpenTask: (id: string) => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const visible = candidates.slice(0, 6)

  const promote = async (c: NellCandidate) => {
    setBusy(c.id)
    // Insert as a task. Status='waiting' so it shows up in Needs You and in
    // the Visibility "Pitch drafted" stage immediately.
    const insert = await supabase.from('tasks').insert({
      title: c.podcast_target
        ? `Pitch ${c.name ?? 'candidate'} → ${c.podcast_target}`
        : `Pitch ${c.name ?? 'candidate'}`,
      description: c.pitch_draft ?? c.signal_description ?? '',
      status: 'waiting',
      workstream: 'podcast_booking',
      agent: 'nell',
      link_primary: c.source_url ?? c.linkedin_url ?? c.personal_url ?? '',
      draft_hook: c.pitch_draft ?? null,
      created: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').maybeSingle()

    if (insert.error || !insert.data) {
      toast('Could not promote candidate.', 'error')
      setBusy(null)
      return
    }

    const newTaskId = insert.data.id as string
    await supabase.from('nell_candidates').update({
      status: 'pitched',
      pitched_at: new Date().toISOString(),
    }).eq('id', c.id)

    await logKrishAction(newTaskId, 'promote_from_nell', 'nell',
      `Promoted candidate ${c.name ?? c.id} into pitch pipeline.`)

    toast('Promoted to pitch pipeline.', 'success')
    setBusy(null)
  }

  return (
    <div className="rounded-xl border border-dashed border-violet-500/25 bg-violet-500/[0.04]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-violet-500/[0.06] transition-colors text-left"
      >
        <ChevronRight
          size={11}
          className={`text-violet-300 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Users size={11} className="text-violet-300" />
        <span className="text-[11px] font-semibold text-violet-200">Pending Nell candidates</span>
        <span className="text-[11px] text-violet-200/70 tabular-nums">{candidates.length}</span>
      </button>
      {open && (
        <div className="border-t border-violet-500/15 divide-y divide-violet-500/10">
          {visible.map(c => (
            <div key={c.id} className="px-3 py-2 flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/85 leading-snug truncate">
                  {c.name ?? 'Unnamed candidate'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {c.podcast_target && (
                    <span className="text-[10px] text-white/55 truncate max-w-[140px]">
                      → {c.podcast_target}
                    </span>
                  )}
                  {typeof c.fit_score === 'number' && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 tabular-nums">
                      Fit {c.fit_score}
                    </span>
                  )}
                  <span className="text-[10px] text-white/35 tabular-nums">
                    {humanAge(c.surfaced_at ?? null)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); promote(c) }}
                disabled={busy === c.id}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 transition-colors flex-shrink-0"
                aria-label={`Approve and promote ${c.name ?? 'candidate'}`}
              >
                <ThumbsUp size={10} />
                Approve
              </button>
              {(c.source_url || c.linkedin_url || c.personal_url) && (
                <a
                  href={c.source_url ?? c.linkedin_url ?? c.personal_url ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 text-white/30 hover:text-white/70 transition-colors"
                  aria-label="Open source"
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
          {candidates.length > visible.length && (
            <div className="px-3 py-1.5 text-[10px] text-violet-200/55 text-center">
              +{candidates.length - visible.length} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
