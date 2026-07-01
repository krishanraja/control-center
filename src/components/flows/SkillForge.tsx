import React, { useEffect, useState } from 'react'
import { Wand2, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { SkillReviewModal } from './SkillReviewModal'
import { SkillDeliveryHistory } from './SkillDeliveryHistory'
import { ProcessingOverlay } from '../shared/ProcessingOverlay'
import type { SkillData, QualityGateResult, TriageResult, SkillDelivery } from './types'

const API = import.meta.env.VITE_API_URL ?? ''

const PLACEHOLDER_TRANSCRIPT = `Example: "Every Monday I take the Slack updates from sales and turn them into a board update for our investors. Format is exec summary, then pipeline, then risks. My investors hate bullets. Takes me 45 minutes and it's killing me."`

export function SkillForge() {
  const { toast } = useToast()
  const [transcript, setTranscript] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [showAdditional, setShowAdditional] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [reviewOpen, setReviewOpen] = useState(false)
  const [skills, setSkills] = useState<SkillData[]>([])
  const [qualityGate, setQualityGate] = useState<QualityGateResult[]>([])
  const [triage, setTriage] = useState<TriageResult | null>(null)
  const [deliveryId, setDeliveryId] = useState<string | null>(null)

  const [deliveries, setDeliveries] = useState<SkillDelivery[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from('skill_deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) {
      // Distinguish "missing table" from "no rows" so the operator knows to apply the migration.
      console.warn('[SkillForge] history load error', error.message)
      setDeliveries([])
    } else {
      setDeliveries((data as any) || [])
    }
    setHistoryLoading(false)
  }

  useEffect(() => { loadHistory() }, [])

  const canGenerate = transcript.trim().length >= 20 && clientName.trim().length > 0 && !generating

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)
    try {
      const r = await fetch(`${API}/api/skills/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || undefined,
          additional_context: additionalContext.trim() || undefined,
        }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)

      setTriage(json.triage)
      setSkills(json.skills || [])
      setQualityGate(json.quality_gate || [])
      setDeliveryId(json.delivery_id || null)

      if (!json.triage?.passed) {
        toast(`Triage: better as a ${humanizeRoute(json.triage?.result)}.`, 'info')
        return
      }
      setReviewOpen(true)
      loadHistory()
    } catch (err: any) {
      setError(err?.message || 'Generation failed')
      toast('Generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async () => {
    if (!deliveryId) return
    setError(null)
    setGenerating(true)
    try {
      const r = await fetch(`${API}/api/skills/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || undefined,
          additional_context: additionalContext.trim() || undefined,
          delivery_id: deliveryId,
        }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
      setTriage(json.triage)
      setSkills(json.skills || [])
      setQualityGate(json.quality_gate || [])
      toast('Regenerated.', 'success')
    } catch (err: any) {
      setError(err?.message || 'Regenerate failed')
      toast('Regenerate failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleShip = async (editedSkills: SkillData[]) => {
    if (!deliveryId) return
    if (!clientEmail.trim()) {
      toast('Client email required to ship.', 'error')
      return
    }
    try {
      const r = await fetch(`${API}/api/skills/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_id: deliveryId,
          skills_data: editedSkills,
          client_name: clientName.trim(),
          client_email: clientEmail.trim(),
          quality_gate: qualityGate,
        }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)

      const where = json.zip_url ? `Stored. ${json.email_sent ? 'Email queued.' : 'Email handoff offline.'}` : 'Shipped (storage offline).'
      toast(where, 'success')
      setReviewOpen(false)
      resetForm()
      loadHistory()
    } catch (err: any) {
      toast(err?.message || 'Ship failed', 'error')
    }
  }

  const resetForm = () => {
    setTranscript('')
    setClientName('')
    setClientEmail('')
    setAdditionalContext('')
    setShowAdditional(false)
    setSkills([])
    setQualityGate([])
    setTriage(null)
    setDeliveryId(null)
  }

  const handleHistoryRegenerate = (delivery: SkillDelivery) => {
    setTranscript(delivery.transcript || '')
    setClientName(delivery.client_name || '')
    setClientEmail(delivery.client_email || '')
    setAdditionalContext(delivery.additional_context || '')
    setShowAdditional(!!delivery.additional_context)
    setDeliveryId(null) // create a new delivery row, don't overwrite the historical one
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {generating && !reviewOpen && <ProcessingOverlay label="Drafting skills" sub="Cleo is building them from the transcript" />}
      {/* Left: input form (60%) */}
      <div className="lg:col-span-3 space-y-3">
        <header>
          <h2 className="text-[15px] font-semibold text-white flex items-center gap-2">
            <Wand2 size={14} className="text-violet-400" />
            Skill Forge
          </h2>
          <p className="text-[12px] text-white/45 mt-0.5">
            Paste a client transcript. Ship a custom Agent Skill in minutes.
          </p>
        </header>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Transcript</span>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder={PLACEHOLDER_TRANSCRIPT}
              rows={8}
              className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12.5px] text-white/85 placeholder-white/25 focus:outline-none focus:border-violet-500/40 resize-y"
            />
            <span className="text-[10px] text-white/30 mt-1 block">
              {transcript.length} chars · need 20+
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Client name</span>
              <input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Acme Co"
                className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12.5px] text-white/85 placeholder-white/25 focus:outline-none focus:border-violet-500/40"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Client email</span>
              <input
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="ceo@acme.com"
                type="email"
                className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12.5px] text-white/85 placeholder-white/25 focus:outline-none focus:border-violet-500/40"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowAdditional(s => !s)}
            className="text-[11px] text-white/45 hover:text-white/70 transition-colors"
          >
            {showAdditional ? '− Hide additional context' : '+ Add additional context (optional)'}
          </button>
          {showAdditional && (
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              rows={4}
              placeholder="Extra notes, internal docs, examples…"
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[12.5px] text-white/85 placeholder-white/25 focus:outline-none focus:border-violet-500/40 resize-y"
            />
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {triage && !triage.passed && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-200/85">
              <strong className="font-semibold text-amber-200">Triage: not a skill.</strong>
              <span className="ml-1.5">Better as a <code className="text-white/85">{humanizeRoute(triage.result)}</code>.</span>
              {triage.reasoning && <p className="mt-1 text-amber-200/65">{triage.reasoning}</p>}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-violet-500 hover:bg-violet-400 text-[#fff] text-[12.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {generating ? 'Drafting…' : 'Draft Skills'}
            </button>
            {(transcript || clientName) && !generating && (
              <button
                onClick={resetForm}
                className="text-[11.5px] text-white/40 hover:text-white/70 transition-colors px-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: history (40%) */}
      <div className="lg:col-span-2">
        <SkillDeliveryHistory
          deliveries={deliveries}
          loading={historyLoading}
          onRegenerate={handleHistoryRegenerate}
          onRefresh={loadHistory}
        />
      </div>

      {reviewOpen && (
        <SkillReviewModal
          isOpen={reviewOpen}
          skills={skills}
          qualityGate={qualityGate}
          clientEmail={clientEmail}
          regenerating={generating}
          onClose={() => setReviewOpen(false)}
          onRegenerate={handleRegenerate}
          onShip={handleShip}
          onChange={setSkills}
          onGateChange={setQualityGate}
          clientName={clientName.trim()}
        />
      )}
    </div>
  )
}

function humanizeRoute(r?: string) {
  if (r === 'memory_fact') return 'Memory Web fact'
  if (r === 'custom_instruction') return 'Custom Instruction'
  if (r === 'saved_style') return 'Saved Style'
  return r || 'note'
}
