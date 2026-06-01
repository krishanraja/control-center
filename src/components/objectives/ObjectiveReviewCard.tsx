import React, { useState } from 'react'
import {
  Target, ChevronUp, ChevronDown, Pencil, Check, X, Loader2, ListTree, Bot,
} from 'lucide-react'
import { patchObjective, type Objective } from '../../hooks/useObjectives'
import { useObjectiveTree } from '../../hooks/useObjectiveTree'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { MicButton } from '../shared/VoiceCapture'
import { OwnerSplit } from './OwnerSplit'
import { MilestoneCalibrator } from './MilestoneCalibrator'
import { ObjectiveProposalReview, type ObjectiveProposal } from './ObjectiveProposalReview'

// One objective, reviewed at the OBJECTIVE altitude (Phase 6). The unit of
// interaction is the objective itself — reorder its priority, edit its wording /
// KPI / definition, narrate a reaction (Marcus turns it into a confirmable change
// set), and flip it to OS-run. Milestone shaping is demoted to a disclosure: it's
// available, but it is no longer what this step is about.

export function ObjectiveReviewCard({
  objective,
  isFirst,
  isLast,
  onMove,
  onChanged,
}: {
  objective: Objective
  isFirst: boolean
  isLast: boolean
  onMove: (dir: 'up' | 'down') => void
  onChanged: () => void
}) {
  const h = useHaptics()
  const { toast } = useToast()
  const { tree, refresh: refreshTree } = useObjectiveTree(objective.id)

  const [editing, setEditing] = useState(false)
  const [showMilestones, setShowMilestones] = useState(false)
  const [saving, setSaving] = useState(false)
  const [proposal, setProposal] = useState<{ p: ObjectiveProposal; transcript: string } | null>(null)

  const [title, setTitle] = useState(objective.title)
  const [primaryKpi, setPrimaryKpi] = useState(objective.primary_kpi || '')
  const [dod, setDod] = useState(objective.definition_of_done || '')
  const [whyNow, setWhyNow] = useState(objective.why_now || '')

  const milestones = tree?.milestones || []
  const deepWork =
    milestones.find(m => m.status === 'active') ||
    milestones.find(m => m.status === 'accepted') ||
    milestones.find(m => m.status === 'proposed') ||
    null
  const proposedCount = milestones.filter(m => m.status === 'proposed').length
  const needsKpi = !objective.primary_kpi || !objective.why_now

  const save = async () => {
    if (!title.trim()) { toast('Title cannot be empty', 'error'); return }
    setSaving(true)
    h.tap()
    const res = await patchObjective(objective.id, {
      title: title.trim(),
      primary_kpi: primaryKpi.trim() || null,
      definition_of_done: dod.trim() || null,
      why_now: whyNow.trim() || null,
    })
    setSaving(false)
    if (res.ok) { h.success(); toast('Objective updated', 'success'); setEditing(false); onChanged() }
    else { h.error(); toast(`Save failed: ${res.error}`, 'error') }
  }

  const toggleAuto = async () => {
    h.tap()
    const res = await patchObjective(objective.id, { is_auto: !objective.is_auto })
    if (res.ok) { toast(objective.is_auto ? 'OS hands-off disabled' : 'Handed to the OS — Agatha will decompose & assign', 'success'); onChanged() }
    else toast(`Failed: ${res.error}`, 'error')
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-start gap-2.5 p-3">
        {/* Reorder rail */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <button type="button" onClick={() => onMove('up')} disabled={isFirst} aria-label="Move up"
            className="p-0.5 text-white/40 hover:text-white/80 disabled:opacity-20 disabled:hover:text-white/40">
            <ChevronUp size={14} />
          </button>
          <span className="text-[10px] text-white/35 tabular-nums font-semibold">P{objective.priority ?? '–'}</span>
          <button type="button" onClick={() => onMove('down')} disabled={isLast} aria-label="Move down"
            className="p-0.5 text-white/40 hover:text-white/80 disabled:opacity-20 disabled:hover:text-white/40">
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <div className="flex items-start gap-2">
                <Target size={12} className="text-violet-300/70 mt-1 flex-shrink-0" />
                <p className="text-[13px] font-semibold text-white leading-snug break-words flex-1">{objective.title}</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/45 pl-[18px]">
                {objective.venture && <span className="uppercase tracking-[0.12em]">{objective.venture}</span>}
                {objective.is_auto && <span className="text-emerald-300/70 inline-flex items-center gap-0.5"><Bot size={9} />auto</span>}
                {needsKpi && <span className="text-amber-300/80">needs KPI / why-now</span>}
              </div>
              {objective.primary_kpi && (
                <p className="text-[11px] text-white/55 leading-snug mt-1 pl-[18px]"><span className="text-white/40">KPI:</span> {objective.primary_kpi}</p>
              )}
              {objective.why_now && (
                <p className="text-[11px] text-white/45 italic leading-snug mt-0.5 pl-[18px]">{objective.why_now}</p>
              )}
              <div className="mt-2 pl-[18px]">
                <OwnerSplit ownerSplit={deepWork?.owner_split} contributions={tree?.contributions} autoPct={deepWork?.auto_executable_pct ?? null} compact />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Objective (the multi-week outcome)"
                className="w-full bg-black/30 border border-violet-400/30 rounded px-2 py-1.5 text-[13px] font-semibold text-white focus:outline-none" />
              <input value={primaryKpi} onChange={e => setPrimaryKpi(e.target.value)} placeholder="Primary KPI (how you'll know it's done)"
                className="w-full bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none" />
              <input value={whyNow} onChange={e => setWhyNow(e.target.value)} placeholder="Why now"
                className="w-full bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none" />
              <textarea value={dod} onChange={e => setDod(e.target.value)} placeholder="Definition of done" rows={2}
                className="w-full bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none resize-none" />
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setEditing(false); setTitle(objective.title); setPrimaryKpi(objective.primary_kpi || ''); setDod(objective.definition_of_done || ''); setWhyNow(objective.why_now || '') }}
                  className="text-[11px] text-white/45 hover:text-white/75 px-2 py-1">Cancel</button>
                <button type="button" onClick={save} disabled={saving}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-100 bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/40 rounded px-2.5 py-1 disabled:opacity-50">
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Objective-level affordances */}
        {!editing && (
          <div className="flex-shrink-0 flex items-center gap-0.5">
            <MicButton
              endpoint={`/api/objectives/voice?goal_id=${encodeURIComponent(objective.id)}`}
              onJson={(j) => {
                if (j.proposal) setProposal({ p: j.proposal as ObjectiveProposal, transcript: (j.transcript as string) || '' })
                else toast((j.transcript as string) ? 'Heard you, but no clear change — edit directly.' : 'Voice unavailable. Edit directly.', 'info' as 'success')
              }}
              onError={() => toast('Voice unavailable. Edit directly.', 'error')}
            />
            <button type="button" onClick={() => { h.tap(); setEditing(true) }} title="Edit objective" className="p-1 text-white/45 hover:text-white/80">
              <Pencil size={12} />
            </button>
          </div>
        )}
      </div>

      {proposal && (
        <div className="px-3 pb-3">
          <ObjectiveProposalReview
            proposal={proposal.p}
            transcript={proposal.transcript}
            objectives={[objective]}
            onApplied={() => { setProposal(null); onChanged(); refreshTree() }}
            onDismiss={() => setProposal(null)}
          />
        </div>
      )}

      {/* Secondary: shape milestones (demoted from the headline of this step) +
          OS-run toggle. */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-white/[0.04]">
        <button type="button" onClick={() => { h.tap(); setShowMilestones(v => !v) }}
          className="inline-flex items-center gap-1.5 text-[10px] text-white/45 hover:text-white/75">
          <ListTree size={11} />
          {showMilestones ? 'Hide milestones' : `Shape milestones${proposedCount > 0 ? ` · ${proposedCount} proposed` : ''}`}
        </button>
        <button type="button" onClick={toggleAuto}
          className={`text-[10px] font-semibold inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${objective.is_auto ? 'text-emerald-200 bg-emerald-500/15' : 'text-white/45 hover:text-white/75'}`}>
          <Bot size={10} /> {objective.is_auto ? 'OS-run' : 'Let OS run it'}
        </button>
      </div>

      {showMilestones && (
        <div className="px-3 pb-3">
          <MilestoneCalibrator goalId={objective.id} />
        </div>
      )}
    </div>
  )
}
