import React, { useState } from 'react'
import {
  Check, X, ThumbsDown, Pencil, Plus, Loader2, ChevronUp, ChevronDown,
  Sparkles, Clock, CheckCircle2,
} from 'lucide-react'
import { useObjectiveTree, type Milestone } from '../../hooks/useObjectiveTree'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'

interface Props {
  goalId: string
}

// Calibrator for one objective. Lists Marcus's proposed milestones plus
// Krish-accepted ones in sequence order. Each row supports accept, tweak
// (inline edit), reject (with reason), and complete. A footer button fires
// the Phase 3 proposer if no proposed milestones exist yet.
export function MilestoneCalibrator({ goalId }: Props) {
  const { tree, loading, refresh } = useObjectiveTree(goalId)
  const h = useHaptics()
  const { toast } = useToast()
  const [proposing, setProposing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const objective = tree?.objective
  const milestones = (tree?.milestones || []).filter(m => m.status !== 'dropped')
  const hasProposed = milestones.some(m => m.status === 'proposed')

  const fireProposer = async () => {
    if (!goalId) return
    setProposing(true)
    h.tap()
    try {
      const r = await fetch('/api/objectives/propose-milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_id: goalId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) {
        if (j.skipped) {
          toast(`Skipped: ${j.reason || 'already proposed'}`, 'info' as 'success')
        } else {
          throw new Error(j.error || `HTTP ${r.status}`)
        }
      } else {
        h.success()
        toast(`Marcus proposed ${j.inserted_count || 0} milestones`, 'success')
      }
      refresh()
    } catch (e) {
      h.error()
      toast(`Proposer failed: ${(e as Error).message}`, 'error')
    } finally {
      setProposing(false)
    }
  }

  const addKrishAuthored = async () => {
    if (!newTitle.trim()) return
    h.tap()
    try {
      const r = await fetch(`/api/objectives/${encodeURIComponent(goalId)}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim() || null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setNewTitle('')
      setNewDescription('')
      setAdding(false)
      h.success()
      toast('Milestone added', 'success')
      refresh()
    } catch (e) {
      h.error()
      toast(`Add failed: ${(e as Error).message}`, 'error')
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] text-white/45">
        <Loader2 size={12} className="animate-spin inline mr-2" />
        Loading milestones...
      </div>
    )
  }

  if (!objective) {
    return (
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] px-4 py-3 text-[12px] text-rose-200/70">
        Objective not found.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.04] to-transparent p-3 space-y-2">
      {objective.why_now && (
        <p className="text-[11px] text-white/55 italic leading-snug px-1">{objective.why_now}</p>
      )}

      {milestones.length === 0 && (
        <div className="rounded-md border border-dashed border-white/[0.08] px-3 py-4 text-center">
          <p className="text-[12px] text-white/45 mb-2">No milestones yet.</p>
          <p className="text-[11px] text-white/35">Have Marcus propose a sequence, or add your own below.</p>
        </div>
      )}

      <ol className="space-y-1.5">
        {milestones.map((m, i) => (
          <MilestoneRow
            key={m.id}
            milestone={m}
            isFirst={i === 0}
            isLast={i === milestones.length - 1}
            onChanged={refresh}
          />
        ))}
      </ol>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
        {!hasProposed ? (
          <button
            type="button"
            onClick={fireProposer}
            disabled={proposing}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-100 bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/30 rounded-md px-2.5 py-1.5 disabled:opacity-50"
          >
            {proposing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {proposing ? 'Marcus drafting...' : 'Have Marcus propose milestones'}
          </button>
        ) : <span className="text-[10px] text-white/35 italic">Marcus proposals loaded; review above.</span>}

        {!adding ? (
          <button
            type="button"
            onClick={() => { h.tap(); setAdding(true) }}
            className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white border border-white/[0.08] hover:border-white/15 rounded-md px-2 py-1.5"
          >
            <Plus size={10} />
            Add your own
          </button>
        ) : null}
      </div>

      {adding && (
        <div className="rounded-md border border-white/[0.08] bg-black/30 p-2.5 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Milestone title (concise, action-oriented)"
            autoFocus
            className="w-full bg-black/30 border border-white/[0.06] rounded px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Optional 1 to 2 sentences on why this is the right week-sized chunk"
            rows={2}
            className="w-full bg-black/30 border border-white/[0.06] rounded px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setNewTitle(''); setNewDescription('') }}
              className="text-[11px] text-white/45 hover:text-white/75 px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addKrishAuthored}
              disabled={!newTitle.trim()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-100 bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/40 rounded px-2.5 py-1 disabled:opacity-50"
            >
              <Check size={11} />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  proposed: { label: 'Proposed', bg: 'bg-amber-500/15',   text: 'text-amber-200' },
  accepted: { label: 'Accepted', bg: 'bg-emerald-500/15', text: 'text-emerald-200' },
  active:   { label: 'Active',   bg: 'bg-violet-500/20',  text: 'text-violet-100' },
  done:     { label: 'Done',     bg: 'bg-white/[0.08]',   text: 'text-white/60' },
}

const SOURCE_META: Record<string, string> = {
  marcus_proposed: 'Marcus',
  krish_authored: 'Krish',
  krish_tweaked: 'Krish edit',
  agatha_decomposed: 'Agatha',
}

function MilestoneRow({
  milestone, onChanged,
}: {
  milestone: Milestone
  isFirst: boolean
  isLast: boolean
  onChanged: () => void
}) {
  const h = useHaptics()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [editTitle, setEditTitle] = useState(milestone.title)
  const [editDescription, setEditDescription] = useState(milestone.description || '')
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)

  const meta = STATUS_META[milestone.status] || STATUS_META.proposed

  const callPatch = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/milestones/${encodeURIComponent(milestone.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      toast(successMsg, 'success')
      onChanged()
    } catch (e) {
      h.error()
      toast(`Failed: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const accept = () => { h.tap(); void callPatch({ action: 'accept' }, 'Accepted') }
  const complete = () => { h.tap(); void callPatch({ action: 'complete' }, 'Marked done') }
  const saveEdit = () => {
    if (!editTitle.trim()) return
    h.tap()
    void callPatch(
      { action: 'tweak', title: editTitle.trim(), description: editDescription.trim() || null },
      'Saved',
    ).then(() => setEditing(false))
  }

  const reject = async () => {
    if (!rejectReason.trim()) {
      toast('Reason required so Marcus learns the pattern', 'error')
      return
    }
    setBusy(true)
    h.tap()
    try {
      const r = await fetch(`/api/milestones/${encodeURIComponent(milestone.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_text: rejectReason.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      toast('Rejected. Marcus will learn the altitude.', 'success')
      setRejecting(false)
      setRejectReason('')
      onChanged()
    } catch (e) {
      h.error()
      toast(`Reject failed: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-md border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <div className="flex-shrink-0 w-6 h-6 rounded bg-white/[0.05] border border-white/[0.06] inline-flex items-center justify-center text-[11px] font-bold tabular-nums text-white/65">
          {milestone.sequence}
        </div>
        <div className="flex-1 min-w-0">
          {!editing ? (
            <p className="text-[12px] font-semibold text-white leading-snug break-words">{milestone.title}</p>
          ) : (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              autoFocus
              className="w-full bg-black/30 border border-violet-400/30 rounded px-2 py-1 text-[12px] text-white focus:outline-none"
            />
          )}
          <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold uppercase tracking-[0.12em] ${meta.bg} ${meta.text}`}>
              {meta.label}
            </span>
            <span>by {SOURCE_META[milestone.source] || milestone.source}</span>
            {typeof milestone.est_deep_work_hours === 'number' && (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={9} />
                {milestone.est_deep_work_hours}h
              </span>
            )}
            {typeof milestone.task_count === 'number' && milestone.task_count > 0 && (
              <span className="tabular-nums">{milestone.tasks_done || 0}/{milestone.task_count} tasks</span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-0.5">
          {milestone.status === 'proposed' && !editing && !rejecting && (
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              title="Accept"
              className="p-1 text-emerald-300/70 hover:text-emerald-200"
            >
              <Check size={13} />
            </button>
          )}
          {milestone.status === 'accepted' && !editing && !rejecting && (
            <button
              type="button"
              onClick={complete}
              disabled={busy}
              title="Mark done"
              className="p-1 text-emerald-300/70 hover:text-emerald-200"
            >
              <CheckCircle2 size={13} />
            </button>
          )}
          {!editing && !rejecting && milestone.status !== 'done' && (
            <button
              type="button"
              onClick={() => { h.tap(); setEditing(true); setEditTitle(milestone.title); setEditDescription(milestone.description || '') }}
              title="Tweak"
              className="p-1 text-white/45 hover:text-white/80"
            >
              <Pencil size={11} />
            </button>
          )}
          {!editing && !rejecting && milestone.status !== 'done' && (
            <button
              type="button"
              onClick={() => { h.tap(); setRejecting(true) }}
              title="Reject"
              className="p-1 text-rose-300/60 hover:text-rose-200"
            >
              <ThumbsDown size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            title={expanded ? 'Collapse' : 'Expand'}
            className="p-1 text-white/40 hover:text-white/70"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {(expanded || editing) && (
        <div className="border-t border-white/[0.04] px-3 py-2 space-y-1.5">
          {!editing ? (
            <>
              {milestone.description && (
                <p className="text-[11px] text-white/65 leading-snug">{milestone.description}</p>
              )}
              {milestone.marcus_reasoning && (
                <p className="text-[10px] text-white/40 italic leading-snug">
                  <span className="not-italic font-semibold text-white/55">Marcus: </span>
                  {milestone.marcus_reasoning}
                </p>
              )}
            </>
          ) : (
            <>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                placeholder="Description"
                className="w-full bg-black/30 border border-violet-400/30 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/30 focus:outline-none resize-none"
              />
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-white/45 hover:text-white/75 px-2 py-1">Cancel</button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={busy || !editTitle.trim()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-100 bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/40 rounded px-2.5 py-1 disabled:opacity-50"
                >
                  <Check size={11} />
                  Save tweak
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {rejecting && (
        <div className="border-t border-rose-400/20 bg-rose-500/[0.04] px-3 py-2 space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-rose-200/80">
            Why is this milestone wrong?
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. wrong sequence, wrong scope, this work belongs to a different objective"
            className="w-full bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/25 focus:border-rose-400/40 focus:outline-none resize-none"
          />
          <p className="text-[10px] text-rose-200/55 italic">
            Posts `marcus_milestone_override` to Vera (milestone altitude). Reason teaches Marcus the right decomposition for this objective shape.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setRejecting(false); setRejectReason('') }} className="text-[11px] text-white/45 hover:text-white/75 px-2 py-1">
              <X size={11} className="inline mr-0.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={busy || !rejectReason.trim()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-100 bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 rounded px-2.5 py-1 disabled:opacity-50"
            >
              <ThumbsDown size={11} />
              Reject milestone
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
