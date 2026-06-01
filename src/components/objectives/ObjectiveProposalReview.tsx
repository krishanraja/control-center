import React, { useState } from 'react'
import { Sparkles, ArrowUpDown, Pencil, GitBranch, Check, X, Loader2 } from 'lucide-react'
import { patchObjective, type Objective } from '../../hooks/useObjectives'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'

// Marcus's interpretation of a spoken objective narration, rendered as a
// confirmable diff. NOTHING is applied until Krish hits Apply. Apply executes the
// change set against the objective-altitude APIs and then asks Marcus to
// recalibrate the milestones beneath any reshaped objective.

export interface ObjectiveProposal {
  summary?: string
  reprioritize?: Array<{ id: string; title?: string; priority: number }>
  edits?: Array<{ id: string; title?: string; primary_kpi?: string; definition_of_done?: string; why_now?: string }>
  relevel?: null | {
    promote: { suggested_id: string; title: string; venture: string | null; primary_kpi: string | null; definition_of_done: string | null; why_now: string | null }
    demote: { objective_id: string; as_milestone_title: string }
  }
  recalibrate_goal_ids?: string[]
  notes?: string
}

async function recalibrate(goalId: string, krishContext: string) {
  await fetch('/api/objectives/propose-milestones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal_id: goalId, mode: 'recalibrate', krish_context: krishContext }),
  }).catch(() => undefined)
}

export function ObjectiveProposalReview({
  proposal,
  transcript,
  objectives,
  onApplied,
  onDismiss,
}: {
  proposal: ObjectiveProposal
  transcript: string
  objectives: Objective[]
  onApplied: () => void
  onDismiss: () => void
}) {
  const h = useHaptics()
  const { toast } = useToast()
  const [applying, setApplying] = useState(false)

  const reprioritize = proposal.reprioritize || []
  const edits = proposal.edits || []
  const relevel = proposal.relevel || null
  const recalcIds = new Set(proposal.recalibrate_goal_ids || [])
  const titleById = new Map(objectives.map(o => [o.id, o.title]))
  const nothing = reprioritize.length === 0 && edits.length === 0 && !relevel && recalcIds.size === 0

  const apply = async () => {
    setApplying(true)
    h.tap()
    const errors: string[] = []

    // 1. Reprioritize.
    for (const r of reprioritize) {
      const res = await patchObjective(r.id, { action: 'reorder', priority: r.priority })
      if (!res.ok) errors.push(`priority ${r.id}: ${res.error}`)
    }

    // 2. Field edits (PATCH auto-writes marcus_objective_amended on a title change).
    for (const e of edits) {
      const body: Record<string, unknown> = {}
      if (e.title !== undefined) body.title = e.title
      if (e.primary_kpi !== undefined) body.primary_kpi = e.primary_kpi
      if (e.definition_of_done !== undefined) body.definition_of_done = e.definition_of_done
      if (e.why_now !== undefined) body.why_now = e.why_now
      if (Object.keys(body).length === 0) continue
      const res = await patchObjective(e.id, body)
      if (!res.ok) errors.push(`edit ${e.id}: ${res.error}`)
    }

    // 3. Re-level: promote a new parent objective, demote the old one to a
    //    milestone under it (recorded as marcus_objective_releveled).
    if (relevel) {
      const demotePriority = objectives.find(o => o.id === relevel.demote.objective_id)?.priority ?? null
      try {
        const cr = await fetch('/api/objectives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: relevel.promote.suggested_id,
            title: relevel.promote.title,
            venture: relevel.promote.venture,
            primary_kpi: relevel.promote.primary_kpi,
            definition_of_done: relevel.promote.definition_of_done,
            why_now: relevel.promote.why_now,
            priority: demotePriority,
            status: 'active',
          }),
        })
        const cj = await cr.json().catch(() => ({}))
        if (!cj.ok) throw new Error(cj.error || `create ${cr.status}`)

        // The demoted objective's essence becomes a milestone under the new one.
        await fetch(`/api/objectives/${encodeURIComponent(relevel.promote.suggested_id)}/milestones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: relevel.demote.as_milestone_title }),
        }).catch(() => undefined)

        // Drop the old objective with the objective-altitude learning signal.
        await patchObjective(relevel.demote.objective_id, {
          status: 'dropped',
          feedback: {
            reason_code: 'marcus_objective_releveled',
            reason_text: relevel.promote.title,
            meta: { promoted_to: relevel.promote.suggested_id, demoted_as_milestone: relevel.demote.as_milestone_title },
          },
        })
        recalcIds.add(relevel.promote.suggested_id)
      } catch (e) {
        errors.push(`relevel: ${(e as Error).message}`)
      }
    }

    // 4. Recalibrate milestones under reshaped objectives.
    for (const gid of recalcIds) await recalibrate(gid, transcript)

    setApplying(false)
    if (errors.length === 0) {
      h.success()
      toast('Applied. Marcus is recalibrating the milestones beneath.', 'success')
      onApplied()
    } else {
      h.error()
      toast(`Applied with issues: ${errors[0]}`, 'error')
      onApplied()
    }
  }

  return (
    <div className="rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <Sparkles size={13} className="text-violet-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200/80 font-semibold">Marcus heard</p>
          <p className="text-[12px] text-white/85 leading-snug mt-0.5">{proposal.summary || 'No structured change detected.'}</p>
        </div>
      </div>

      {transcript && (
        <p className="text-[10px] text-white/40 italic leading-snug border-l border-white/10 pl-2">“{transcript}”</p>
      )}

      <ul className="space-y-1 text-[11px] text-white/70">
        {reprioritize.map(r => (
          <li key={`p-${r.id}`} className="flex items-start gap-1.5">
            <ArrowUpDown size={11} className="text-violet-300/70 mt-0.5 flex-shrink-0" />
            <span>Set <span className="text-white/90">{r.title || titleById.get(r.id) || r.id}</span> to priority {r.priority}</span>
          </li>
        ))}
        {edits.map(e => (
          <li key={`e-${e.id}`} className="flex items-start gap-1.5">
            <Pencil size={11} className="text-violet-300/70 mt-0.5 flex-shrink-0" />
            <span>
              Edit <span className="text-white/90">{e.title || titleById.get(e.id) || e.id}</span>
              {[e.title && 'title', e.primary_kpi && 'KPI', e.definition_of_done && 'definition', e.why_now && 'why-now'].filter(Boolean).length
                ? <span className="text-white/45"> · {[e.title && 'title', e.primary_kpi && 'KPI', e.definition_of_done && 'definition', e.why_now && 'why-now'].filter(Boolean).join(', ')}</span>
                : null}
            </span>
          </li>
        ))}
        {relevel && (
          <li className="flex items-start gap-1.5">
            <GitBranch size={11} className="text-amber-300/80 mt-0.5 flex-shrink-0" />
            <span>
              Promote <span className="text-white/90">{relevel.promote.title}</span>; demote{' '}
              <span className="text-white/90">{titleById.get(relevel.demote.objective_id) || relevel.demote.objective_id}</span> to a milestone under it
            </span>
          </li>
        )}
        {[...recalcIds].filter(id => !relevel || id !== relevel.promote.suggested_id).map(id => (
          <li key={`r-${id}`} className="flex items-start gap-1.5">
            <Sparkles size={11} className="text-violet-300/70 mt-0.5 flex-shrink-0" />
            <span>Recalibrate milestones under <span className="text-white/90">{titleById.get(id) || id}</span></span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onDismiss} className="text-[11px] text-white/45 hover:text-white/75 px-2 py-1">
          <X size={11} className="inline mr-0.5" /> Discard
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={applying || nothing}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {applying ? 'Applying…' : 'Apply & recalibrate'}
        </button>
      </div>
    </div>
  )
}
