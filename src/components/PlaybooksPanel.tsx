import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Loader2, Lock, ExternalLink, Check } from 'lucide-react'
import type { Sequence, SequenceStep, SequencesData } from '../types/sequences'

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEY = 'playbooks_completed_steps'

function getCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function markCompleted(id: string): Set<string> {
  const set = getCompleted()
  set.add(id)
  localStorage.setItem(LS_KEY, JSON.stringify([...set]))
  return set
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isStepDone(step: SequenceStep, completed: Set<string>): boolean {
  return step.status === 'done' || completed.has(step.id)
}

function isStepBlocked(step: SequenceStep, steps: SequenceStep[], completed: Set<string>): boolean {
  if (!step.blocked_by) return false
  const blocker = steps.find(s => s.id === step.blocked_by)
  if (!blocker) return false
  return !isStepDone(blocker, completed)
}

function getProgress(steps: SequenceStep[], completed: Set<string>): { done: number; total: number } {
  const done = steps.filter(s => isStepDone(s, completed)).length
  return { done, total: steps.length }
}

function getNextKrishStep(steps: SequenceStep[], completed: Set<string>): SequenceStep | null {
  return steps.find(s =>
    s.owner === 'krish' &&
    !isStepDone(s, completed) &&
    !isStepBlocked(s, steps, completed)
  ) ?? null
}

function countUnblockedKrishSteps(sequences: Sequence[], completed: Set<string>): number {
  let count = 0
  for (const seq of sequences) {
    for (const step of seq.steps) {
      if (step.owner === 'krish' && !isStepDone(step, completed) && !isStepBlocked(step, seq.steps, completed)) {
        count++
      }
    }
  }
  return count
}

// ─── Agent label from owner string ───────────────────────────────────────────
function agentLabel(owner: string): string {
  if (owner === 'krish') return 'YOU'
  return owner.replace('agent:', '').toUpperCase()
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    blocked_on_krish: { label: 'Needs You', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    in_progress:      { label: 'In Progress', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    done:             { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    ready:            { label: 'Ready', cls: 'bg-white/10 text-white/60 border-white/20' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-white/10 text-white/50 border-white/20' }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

// ─── Step circle icon ─────────────────────────────────────────────────────────
function StepCircle({ done, inProgress, isNext }: { done: boolean; inProgress: boolean; isNext: boolean }) {
  if (done) return <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
  if (inProgress) return (
    <div className="relative flex-shrink-0">
      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
    </div>
  )
  if (isNext) return (
    <div className="w-5 h-5 rounded-full border-2 border-amber-400 bg-amber-400/10 flex-shrink-0 flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
    </div>
  )
  return <Circle className="w-5 h-5 text-white/20 flex-shrink-0" />
}

// ─── Individual step row ──────────────────────────────────────────────────────
function StepRow({
  step,
  steps,
  completed,
  onMarkDone,
  justDone,
}: {
  step: SequenceStep
  steps: SequenceStep[]
  completed: Set<string>
  onMarkDone: (id: string) => void
  justDone: string | null
}) {
  const done = isStepDone(step, completed)
  const blocked = isStepBlocked(step, steps, completed)
  const inProgress = step.status === 'in_progress' && !done
  const isKrish = step.owner === 'krish'
  const isNext = isKrish && !done && !blocked
  const flashing = justDone === step.id

  return (
    <div className={`relative flex gap-3 py-3 px-3 rounded-lg transition-all duration-300 ${
      isNext && !done ? 'bg-amber-500/8 border border-amber-400/20' :
      done ? 'opacity-50' :
      blocked ? 'opacity-40' : ''
    } ${flashing ? 'bg-emerald-500/15' : ''}`}>
      {/* Step circle */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <StepCircle done={done} inProgress={inProgress} isNext={isNext} />
        {/* connector — handled by parent */}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[13px] leading-snug ${done ? 'line-through text-white/30' : blocked ? 'text-white/30' : 'text-white/90'}`}>
            {blocked && <Lock className="w-3 h-3 inline mr-1 mb-0.5 text-white/20" />}
            {step.description}
          </p>

          {/* Owner badge */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
            isKrish
              ? 'bg-amber-500/15 text-amber-400 border border-amber-400/30'
              : 'bg-violet-500/15 text-violet-400 border border-violet-400/30'
          }`}>
            {agentLabel(step.owner)}
          </span>
        </div>

        {/* Krish-specific detail */}
        {isKrish && !done && (
          <div className="mt-2 space-y-2">
            {step.owner_note && (
              <p className="text-[12px] text-white/50 leading-relaxed">{step.owner_note}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {step.estimated_mins && (
                <span className="text-[11px] bg-amber-500/10 text-amber-400/80 border border-amber-400/20 rounded px-2 py-0.5">
                  ~{step.estimated_mins} min
                </span>
              )}

              {step.links?.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] border border-white/20 rounded px-2 py-0.5 text-white/50 hover:text-white/80 hover:border-white/40 transition-colors"
                >
                  {link.label}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ))}

              {!blocked && (
                <button
                  onClick={() => onMarkDone(step.id)}
                  className={`flex items-center gap-1 text-[11px] font-semibold rounded px-2.5 py-0.5 transition-all duration-200 ${
                    flashing
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/40'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-400/30 hover:bg-amber-500/25'
                  }`}
                >
                  <Check className="w-3 h-3" />
                  {flashing ? 'Done!' : 'Mark Done'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sequence card ────────────────────────────────────────────────────────────
function SequenceCard({
  seq,
  completed,
  onMarkDone,
  justDone,
}: {
  seq: Sequence
  completed: Set<string>
  onMarkDone: (id: string) => void
  justDone: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const { done, total } = getProgress(seq.steps, completed)
  const nextKrish = getNextKrishStep(seq.steps, completed)
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-4 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-bold bg-violet-500/15 text-violet-400 border border-violet-400/20 rounded-full px-2 py-0.5">
                {seq.agent.toUpperCase()}
              </span>
              <StatusBadge status={seq.status} />
            </div>
            <p className="text-[14px] font-semibold text-white leading-snug">{seq.title}</p>
            {nextKrish && !expanded && (
              <p className="text-[11px] text-amber-400/70 mt-1 truncate">
                → {nextKrish.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] text-white/40">{done}/{total}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 bg-white/[0.07] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {/* Expanded step track */}
      {expanded && (
        <div className="border-t border-white/[0.07] px-3 pb-3">
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[22px] top-3 bottom-8 w-px bg-white/[0.06]" />

            <div className="space-y-0.5 pt-2">
              {seq.steps.map(step => (
                <StepRow
                  key={step.id}
                  step={step}
                  steps={seq.steps}
                  completed={completed}
                  onMarkDone={onMarkDone}
                  justDone={justDone}
                />
              ))}
            </div>
          </div>

          {/* Source doc */}
          <div className="mt-3 pt-3 border-t border-white/[0.05]">
            <a
              href={seq.source_doc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View Full Plan
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function PlaybooksPanel() {
  const [data, setData] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState<Set<string>>(getCompleted)
  const [justDone, setJustDone] = useState<string | null>(null)

  useEffect(() => {
    fetch('/data/sequences.json')
      .then(r => r.json())
      .then((d: SequencesData) => {
        setData(d.sequences)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleMarkDone = (id: string) => {
    const updated = markCompleted(id)
    setCompleted(new Set(updated))
    setJustDone(id)
    setTimeout(() => setJustDone(null), 1500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    )
  }

  const needsYou = countUnblockedKrishSteps(data, completed)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-white tracking-tight">Playbooks</h1>
        <p className="text-[13px] text-white/40 mt-0.5">Your next actions, sequenced by agent</p>
      </div>

      {/* Needs-you summary */}
      {needsYou > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-400/20 rounded-xl px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <p className="text-[13px] text-amber-300 font-medium">
            {needsYou} step{needsYou !== 1 ? 's' : ''} waiting on you
          </p>
        </div>
      )}

      {/* Sequence grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...data]
          .sort((a, b) => a.priority - b.priority)
          .map(seq => (
            <SequenceCard
              key={seq.id}
              seq={seq}
              completed={completed}
              onMarkDone={handleMarkDone}
              justDone={justDone}
            />
          ))}
      </div>

      {data.length === 0 && (
        <div className="text-center py-16 text-white/30 text-[13px]">
          No sequences loaded
        </div>
      )}
    </div>
  )
}
