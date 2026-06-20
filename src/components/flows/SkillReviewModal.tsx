import React, { useEffect, useMemo, useState } from 'react'
import { X, Check, AlertTriangle, Loader2, RefreshCw, Send, Wand2, RotateCcw } from 'lucide-react'
import type { SkillData, QualityGateResult } from './types'
import { ProcessingOverlay } from '../shared/ProcessingOverlay'
import { useToast } from '../shared/Toast'

const API = import.meta.env.VITE_API_URL ?? ''

const EMPTY_SKILL: SkillData = {
  name: '', description: '', body: '', references: [], test_prompts: [], gotchas: [], archetype: '',
}

interface Props {
  isOpen: boolean
  skills: SkillData[]
  qualityGate: QualityGateResult[]
  clientEmail: string
  regenerating: boolean
  onClose: () => void
  onChange: (skills: SkillData[]) => void
  onGateChange: (gate: QualityGateResult[]) => void
  onRegenerate: () => void
  onShip: (skills: SkillData[]) => void
  clientName?: string
}

export function SkillReviewModal({
  isOpen, skills, qualityGate, clientEmail, regenerating,
  onClose, onChange, onGateChange, onRegenerate, onShip, clientName,
}: Props) {
  const { toast } = useToast()
  const [activeIdx, setActiveIdx] = useState(0)
  const [shipping, setShipping] = useState(false)
  // AI refine-with-undo for the active skill — mirrors the content composer's
  // Adjust: a targeted instruction, applied with a one-click revert.
  const [refineInput, setRefineInput] = useState('')
  const [refining, setRefining] = useState(false)
  const [undo, setUndo] = useState<{ skills: SkillData[]; gate: QualityGateResult[] } | null>(null)

  useEffect(() => {
    if (activeIdx >= skills.length) setActiveIdx(0)
  }, [skills.length, activeIdx])

  const active = skills[activeIdx] || skills[0] || EMPTY_SKILL
  const gate = qualityGate[activeIdx]
  const yamlPreview = useMemo(() => buildYamlPreview(active), [active])

  if (!isOpen) return null
  if (skills.length === 0) return null

  const updateActive = (patch: Partial<SkillData>) => {
    const next = skills.slice()
    next[activeIdx] = { ...active, ...patch }
    onChange(next)
  }

  const runRefine = async () => {
    const instruction = refineInput.trim()
    if (!instruction || refining) return
    setRefining(true)
    try {
      const r = await fetch(`${API}/api/skills/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: active, instruction, client_name: clientName }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`)
      // Snapshot for undo, then apply the revised skill + its fresh gate.
      setUndo({ skills: skills.slice(), gate: qualityGate.slice() })
      const nextSkills = skills.slice(); nextSkills[activeIdx] = j.skill
      const nextGate = qualityGate.slice(); if (j.quality_gate) nextGate[activeIdx] = j.quality_gate
      onChange(nextSkills); onGateChange(nextGate)
      setRefineInput('')
      toast('Refined — Undo if it missed.', 'success')
    } catch (e: any) {
      toast(`Refine failed: ${e?.message || 'error'}`, 'error')
    } finally {
      setRefining(false)
    }
  }

  const undoRefine = () => {
    if (!undo) return
    onChange(undo.skills); onGateChange(undo.gate); setUndo(null)
    toast('Reverted.', 'success')
  }

  const handleShip = async () => {
    if (!clientEmail.trim()) return
    setShipping(true)
    try {
      await onShip(skills)
    } finally {
      setShipping(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      {(shipping || regenerating || refining) && <ProcessingOverlay label={shipping ? 'Shipping skills' : refining ? 'Refining this skill' : 'Regenerating skills'} sub={shipping ? 'Saving and emailing the client' : refining ? 'Applying your instruction' : 'Cleo is rebuilding them'} />}
      <div className="relative w-full max-w-6xl max-h-[92vh] rounded-2xl border border-white/[0.08] bg-[#111114] shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-white">Skill Review</h2>
            <p className="text-[11.5px] text-white/45 truncate">
              {skills.length} skill{skills.length === 1 ? '' : 's'} ready · review and ship
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        {skills.length > 1 && (
          <div className="flex gap-1 px-5 pt-3 border-b border-white/[0.04] overflow-x-auto">
            {skills.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`text-[12px] px-3 py-1.5 rounded-t-lg whitespace-nowrap transition-colors ${
                  i === activeIdx
                    ? 'bg-white/[0.06] text-white border-b border-violet-400'
                    : 'text-white/45 hover:text-white/75'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Body: split pane */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-0 min-h-0">
          {/* Editor (60%) */}
          <div className="lg:col-span-3 flex flex-col min-h-0 border-r border-white/[0.04]">
            <div className="px-5 py-3 space-y-3 overflow-y-auto">
              {/* AI refine bar — targeted change to this skill, with undo. */}
              <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.04] p-2">
                <div className="flex items-center gap-1.5">
                  <Wand2 size={13} className="text-violet-300 flex-shrink-0" />
                  <input
                    value={refineInput}
                    onChange={e => setRefineInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') runRefine() }}
                    placeholder="Tell Cleo what to change about this skill…"
                    className="flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/30 focus:outline-none"
                  />
                  {undo && (
                    <button type="button" onClick={undoRefine} title="Undo last refine"
                      className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-md hover:bg-white/[0.06]">
                      <RotateCcw size={11} /> Undo
                    </button>
                  )}
                  <button type="button" onClick={runRefine} disabled={refining || !refineInput.trim()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40">
                    {refining ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Refine
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-1">Name</label>
                <input
                  value={active.name}
                  onChange={e => updateActive({ name: e.target.value })}
                  className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-1.5 text-[12.5px] text-white/85 font-mono focus:outline-none focus:border-violet-500/40"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-1">Description</label>
                <textarea
                  value={active.description}
                  onChange={e => updateActive({ description: e.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12px] text-white/85 focus:outline-none focus:border-violet-500/40 resize-y"
                />
                <span className="text-[10px] text-white/30 mt-0.5 block">{active.description.length}/1024</span>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-1">SKILL.md Body</label>
                <textarea
                  value={active.body}
                  onChange={e => updateActive({ body: e.target.value })}
                  rows={18}
                  className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12px] text-white/85 font-mono leading-relaxed focus:outline-none focus:border-violet-500/40 resize-y"
                />
              </div>

              <details className="rounded-lg border border-white/[0.06] bg-white/[0.015]">
                <summary className="cursor-pointer px-3 py-2 text-[11.5px] text-white/55 hover:text-white/80">
                  Frontmatter preview
                </summary>
                <pre className="px-3 pb-3 text-[11px] text-white/55 font-mono whitespace-pre-wrap">{yamlPreview}</pre>
              </details>

              <details className="rounded-lg border border-white/[0.06] bg-white/[0.015]">
                <summary className="cursor-pointer px-3 py-2 text-[11.5px] text-white/55 hover:text-white/80">
                  Test prompts ({active.test_prompts?.length || 0})
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  {(active.test_prompts || []).map((p, i) => (
                    <textarea
                      key={i}
                      value={p}
                      onChange={e => {
                        const next = (active.test_prompts || []).slice()
                        next[i] = e.target.value
                        updateActive({ test_prompts: next })
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-[12px] text-white/80 focus:outline-none focus:border-violet-500/40 resize-y"
                    />
                  ))}
                </div>
              </details>

              <details className="rounded-lg border border-white/[0.06] bg-white/[0.015]">
                <summary className="cursor-pointer px-3 py-2 text-[11.5px] text-white/55 hover:text-white/80">
                  References ({active.references?.length || 0})
                </summary>
                <div className="px-3 pb-3 space-y-3">
                  {(active.references || []).map((ref, i) => (
                    <div key={i}>
                      <p className="text-[11px] text-white/45 font-mono mb-1">{ref.filename}</p>
                      <textarea
                        value={ref.content}
                        onChange={e => {
                          const next = (active.references || []).slice()
                          next[i] = { ...ref, content: e.target.value }
                          updateActive({ references: next })
                        }}
                        rows={6}
                        className="w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-[11.5px] text-white/75 font-mono focus:outline-none focus:border-violet-500/40 resize-y"
                      />
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* Quality gate (40%) */}
          <div className="lg:col-span-2 flex flex-col min-h-0 overflow-y-auto px-5 py-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-3">Quality gate</h3>
            {gate ? (
              <>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className={`text-[20px] font-semibold tabular-nums ${gate.passed === gate.total ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {gate.passed}
                  </span>
                  <span className="text-[13px] text-white/40">/ {gate.total} checks passed</span>
                </div>
                <ul className="space-y-2">
                  {gate.checks.map(c => (
                    <li key={c.id} className="flex items-start gap-2 rounded-lg border border-white/[0.04] bg-white/[0.015] px-2.5 py-2">
                      {c.pass ? (
                        <Check size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className={`text-[12px] ${c.pass ? 'text-white/75' : 'text-amber-200/90'}`}>{c.label}</p>
                        {c.detail && <p className="text-[10.5px] text-white/40 mt-0.5">{c.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[12px] text-white/40">No checks available.</p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
          <p className="text-[11px] text-white/35">
            {clientEmail
              ? <>Will email <code className="text-white/65">{clientEmail}</code> on ship.</>
              : <span className="text-amber-300">Add a client email on the form to enable shipping.</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] text-[12px] font-medium transition-colors disabled:opacity-40"
            >
              {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Regenerate
            </button>
            <button
              onClick={handleShip}
              disabled={shipping || regenerating || !clientEmail.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {shipping ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Ship to Client
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildYamlPreview(skill: SkillData): string {
  const desc = (skill.description || '').split('\n').map(l => '  ' + l).join('\n')
  return [
    '---',
    `name: ${skill.name}`,
    'description: >',
    desc,
    'license: Proprietary. Built by Mindmaker.',
    'compatibility: Designed for Claude Code, Claude.ai, and compatible agent platforms.',
    'metadata:',
    '  author: mindmaker',
    '  version: "1.0"',
    `  archetype: ${skill.archetype}`,
    '---',
  ].join('\n')
}
