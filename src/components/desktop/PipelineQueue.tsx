import React, { useMemo, useState } from 'react'
import { Check, X, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { supabase, logKrishAction } from '../../lib/supabase'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { useToast } from '../shared/Toast'

export const PIPELINE_WORKSTREAMS = ['beta_cohort', 'podcast_booking', 'advisory_sales', 'nurture'] as const

const GROUP_BADGE: Record<string, string> = {
  'CTRL Beta': 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  'Media':     'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  'Mindmake': 'bg-rose-500/10 border-rose-500/30 text-rose-400',
  'Audience':  'bg-amber-500/10 border-amber-500/30 text-amber-400',
}

const priorityWeight = (p?: string | null) => (p === 'high' ? 2 : p === 'medium' ? 1 : 0)

export function PipelineQueue() {
  const allow = useMemo(() => new Set<string>(PIPELINE_WORKSTREAMS as readonly string[]), [])
  const { tasks, loading } = useRealtimeTasks({
    statusIn: ['waiting'],
    filter: t => !!t.workstream && allow.has(t.workstream),
  })

  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const items = useMemo(() => {
    const out = tasks.filter(t => !dismissed.has(t.id))
    out.sort((a, b) => {
      const w = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (w !== 0) return w
      const ta = a.created ? new Date(a.created).getTime() : 0
      const tb = b.created ? new Date(b.created).getTime() : 0
      return ta - tb
    })
    return out
  }, [tasks, dismissed])

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400">Pipeline</span>
        </div>
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 animate-pulse" style={{ height: 92 }} />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-violet-400">Pipeline</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-400/25 bg-white/[0.03]">{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map(task => (
          <PipelineCard
            key={task.id}
            task={task}
            onDismiss={() => setDismissed(s => { const n = new Set(s); n.add(task.id); return n })}
          />
        ))}
      </div>
    </div>
  )
}

function PipelineCard({ task, onDismiss }: { task: TaskRow; onDismiss: () => void }) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const badge = (task.group_label && GROUP_BADGE[task.group_label]) || 'bg-white/[0.04] border-white/[0.08] text-white/50'

  const approve = async () => {
    if (busy) return
    setBusy(true)
    onDismiss()
    await supabase.from('tasks').update({
      status: 'in_progress',
      krish_reviewed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id)
    await logKrishAction(task.id, 'pipeline_approved', 'agatha', task.title)
    toast('Approved — dispatching', 'success')
  }

  const reject = async () => {
    if (busy) return
    setBusy(true)
    onDismiss()
    await supabase.from('tasks').update({
      status: 'done',
      krish_reviewed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id)
    await logKrishAction(task.id, 'pipeline_rejected', 'agatha', task.title)
    toast('Rejected', 'info')
  }

  const copyDraft = async () => {
    if (!task.evidence) return
    try {
      await navigator.clipboard.writeText(task.evidence)
      toast('Draft copied', 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] transition-colors p-3 space-y-2">
      <div className="flex items-start gap-2">
        {task.group_label && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge} flex-shrink-0`}>
            {task.group_label}
          </span>
        )}
        <p className="text-[13px] font-semibold text-white leading-snug flex-1 min-w-0">{task.title}</p>
      </div>

      {task.krish_notes && (
        <p className="text-[11px] text-white/45 leading-relaxed line-clamp-2">{task.krish_notes}</p>
      )}

      {task.evidence && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Hide Draft' : 'View Draft'}
          </button>
          {expanded && (
            <div className="mt-1.5 rounded-lg border border-white/[0.08] bg-black/30 p-2.5 space-y-2">
              <pre className="text-[11px] text-white/75 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-72 overflow-y-auto">
{task.evidence}
              </pre>
              <button
                onClick={copyDraft}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] transition-colors"
              >
                <Copy size={10} /> Copy
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={approve}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          <Check size={11} /> Approve
        </button>
        <button
          onClick={reject}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
        >
          <X size={11} /> Reject
        </button>
      </div>
    </div>
  )
}
