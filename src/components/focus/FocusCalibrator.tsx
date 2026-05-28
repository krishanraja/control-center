import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Mic, Square, Loader2, Check, X, ChevronDown, Plus,
  TrendingUp, Sparkles as SparkleIcon, AlertTriangle,
} from 'lucide-react'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'

// Picker for today's 3 focuses. Renders only when no daily_focus row
// exists for today. Krish sees Marcus's 7 leverage picks as compact
// expandable rows + a dynamic "Today's 3" list. He can pick from
// Marcus, type his own, or mix. Save → daily_focus row written,
// calibrator webhook fires, Home recalibrates.

interface Suggestion {
  kind?: string
  title: string
  why_now?: string
  action_label?: string
  action_kind?: string
  action_target_id?: string | null
  leverage_score?: number | null
  reasoning?: string | null
  beats?: string[]
}

interface SuggestionsPayload {
  marcus_top_three: Suggestion[]
  marcus_alternates: Suggestion[]
  marcus_reasoning: string | null
}

type PickedSource = 'marcus_nominated' | 'krish_swapped' | 'krish_added'

interface Pick {
  // 'marcus' = picked from Marcus's list. Text starts as Marcus's title and
  // is editable; if edited the source becomes 'krish_swapped'.
  // 'custom'  = Krish typed his own from scratch ('krish_added').
  kind: 'marcus' | 'custom'
  suggestion?: Suggestion | null
  text: string
  // Stable id so React keys + sets work even when arrays renumber.
  id: string
}

interface CalibrateBody {
  date: string
  targets: Array<{
    text: string
    source: PickedSource
    concept_id?: string | null
    replaced_marcus_pick?: Suggestion | null
  }>
}

const KIND_META: Record<string, { label: string; bg: string; text: string; Icon: typeof TrendingUp }> = {
  revenue: { label: 'Revenue', bg: 'bg-emerald-500/20', text: 'text-emerald-200', Icon: TrendingUp },
  growth:  { label: 'Growth',  bg: 'bg-violet-500/20',  text: 'text-violet-200',  Icon: SparkleIcon },
  risk:    { label: 'Risk',    bg: 'bg-amber-500/20',   text: 'text-amber-200',   Icon: AlertTriangle },
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function browserCanRecord(): boolean {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined'
}

function suggestionKey(s: Suggestion, fallbackIdx: number): string {
  return s.action_target_id || `${s.kind || 'pick'}-${fallbackIdx}-${s.title.slice(0, 24)}`
}

let customCounter = 0
function newCustomId(): string {
  customCounter += 1
  return `custom-${customCounter}-${Date.now()}`
}

export function FocusCalibrator({ onLocked }: { onLocked?: () => void } = {}) {
  const { today, carry_over, loading } = useDailyFocus()
  const [suggestions, setSuggestions] = useState<SuggestionsPayload>({
    marcus_top_three: [], marcus_alternates: [], marcus_reasoning: null,
  })
  const [picks, setPicks] = useState<Pick[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const h = useHaptics()
  const { toast } = useToast()

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/daily-focus/suggestions')
        if (r.ok) {
          const j = await r.json()
          if (j.ok) setSuggestions({
            marcus_top_three: j.marcus_top_three || [],
            marcus_alternates: j.marcus_alternates || [],
            marcus_reasoning: typeof j.marcus_reasoning === 'string' ? j.marcus_reasoning : null,
          })
        }
      } catch { /* leave empty */ }
    })()
  }, [])

  if (!isFocusEnabled()) return null
  if (loading) return null
  if (today) return null

  // Flatten Marcus's 7 picks (3 primary + up to 4 alternates) into a single
  // ordered list. Stable key per row.
  const allPicks: Array<{ s: Suggestion; key: string; tier: 'primary' | 'alternate' }> = [
    ...suggestions.marcus_top_three.map((s, i) => ({ s, key: suggestionKey(s, i),       tier: 'primary' as const })),
    ...suggestions.marcus_alternates.map((s, i) => ({ s, key: suggestionKey(s, 100 + i), tier: 'alternate' as const })),
  ]

  const marcusPickIndex = new Map<string, number>() // key → slot number
  picks.forEach((p, i) => {
    if (p.kind === 'marcus' && p.suggestion) {
      const k = suggestionKey(p.suggestion, -1)
      marcusPickIndex.set(k, i + 1)
    }
  })

  const canLock = picks.length === 3 && picks.every(p => p.text.trim().length > 0) && !submitting

  const toggleMarcus = (s: Suggestion, key: string) => {
    setPicks(prev => {
      const existing = prev.findIndex(p => p.kind === 'marcus' && p.suggestion && suggestionKey(p.suggestion, -1) === key)
      if (existing >= 0) {
        // Un-pick — slots renumber automatically by index.
        h.tap()
        return prev.filter((_, i) => i !== existing)
      }
      if (prev.length >= 3) {
        // At cap — tell Krish to un-pick first.
        toast('Already at 3. Un-pick one first.', 'error')
        h.error()
        return prev
      }
      h.tap()
      return [...prev, { kind: 'marcus', suggestion: s, text: s.title, id: key }]
    })
  }

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const addCustom = () => {
    if (picks.length >= 3) {
      toast('Already at 3. Un-pick one first.', 'error')
      return
    }
    h.tap()
    setPicks(prev => [...prev, { kind: 'custom', text: '', id: newCustomId() }])
  }

  const updatePickText = (id: string, text: string) => {
    setPicks(prev => prev.map(p => p.id === id ? { ...p, text } : p))
  }

  const removePick = (id: string) => {
    h.tap()
    setPicks(prev => prev.filter(p => p.id !== id))
  }

  const submit = async () => {
    if (!canLock) return
    setSubmitting(true)
    h.tap()
    try {
      const targets = picks.map(p => {
        const text = p.text.trim()
        if (p.kind === 'marcus' && p.suggestion) {
          const original = p.suggestion.title.trim()
          if (text === original) {
            // Untouched Marcus pick.
            return {
              text,
              source: 'marcus_nominated' as PickedSource,
              concept_id: p.suggestion.action_target_id || null,
            }
          }
          // Krish edited the text after picking — counts as a swap.
          return {
            text,
            source: 'krish_swapped' as PickedSource,
            concept_id: p.suggestion.action_target_id || null,
            replaced_marcus_pick: p.suggestion,
          }
        }
        return { text, source: 'krish_added' as PickedSource }
      })
      const body: CalibrateBody = { date: ymd(new Date()), targets }
      const r = await fetch('/api/daily-focus/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'unknown')
      h.success()
      toast('Locked. Marcus is mapping today.', 'success')
      onLocked?.()
    } catch (e) {
      h.error()
      toast(`Lock failed: ${(e as Error).message}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const hasAnyMarcus = allPicks.length > 0

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-5">
      <header className="mb-4">
        <h2 className="text-[16px] font-semibold text-white">What are your 3 today?</h2>
        <p className="text-[12px] text-white/55 mt-1">
          Pick from Marcus's leverage picks below, add your own, or mix. Lock 3 and Home recalibrates.
          {carry_over ? ' Yesterday is still open below.' : ''}
        </p>
      </header>

      {hasAnyMarcus && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Marcus's leverage picks</div>
            <div className="text-[10px] text-white/35 tabular-nums">{allPicks.length} suggestions</div>
          </div>
          {suggestions.marcus_reasoning && (
            <p className="text-[11px] text-white/55 italic mb-3 leading-snug">{suggestions.marcus_reasoning}</p>
          )}
          <div className="flex flex-col gap-1.5">
            {allPicks.map(({ s, key, tier }) => (
              <MarcusPickRow
                key={key}
                pick={s}
                slotIndex={marcusPickIndex.get(key) || null}
                expanded={expanded.has(key)}
                dim={tier === 'alternate'}
                onToggle={() => toggleMarcus(s, key)}
                onToggleExpand={() => toggleExpand(key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Today's 3 — dynamic list of what's picked. */}
      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Today's 3</div>
        <div className="flex flex-col gap-2">
          {picks.length === 0 && (
            <div className="rounded-md border border-dashed border-white/[0.08] px-3 py-3 text-[12px] text-white/40 text-center">
              Pick a leverage card above, or add your own.
            </div>
          )}
          {picks.map((p, i) => (
            <SelectedSlot
              key={p.id}
              n={i + 1}
              pick={p}
              onChangeText={(t) => updatePickText(p.id, t)}
              onRemove={() => removePick(p.id)}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={addCustom}
            disabled={picks.length >= 3}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/70 hover:text-white border border-white/[0.08] rounded-md px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={11} />
            Add your own
          </button>
          {picks.length >= 3 && (
            <span className="text-[10px] text-white/45">3/3 — un-pick to swap</span>
          )}
          {picks.length < 3 && (
            <span className="text-[10px] text-white/45 tabular-nums">{picks.length}/3</span>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canLock}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-100 bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/40 rounded-md px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {submitting ? 'Locking...' : "Lock today's 3"}
        </button>
      </div>
    </section>
  )
}

function MarcusPickRow({
  pick, slotIndex, expanded, dim, onToggle, onToggleExpand,
}: {
  pick: Suggestion
  slotIndex: number | null
  expanded: boolean
  dim: boolean
  onToggle: () => void
  onToggleExpand: () => void
}) {
  const kind = (pick.kind || '').toLowerCase()
  const meta = KIND_META[kind] || { label: pick.kind || 'pick', bg: 'bg-white/10', text: 'text-white/70', Icon: SparkleIcon }
  const Icon = meta.Icon
  const score = typeof pick.leverage_score === 'number' ? pick.leverage_score : null
  const isFallback = score === 0
  const picked = slotIndex != null

  return (
    <div
      className={`rounded-lg border transition-colors ${
        picked
          ? 'border-violet-400/45 bg-violet-500/[0.07]'
          : dim
            ? 'border-white/[0.06] bg-white/[0.02]'
            : 'border-white/[0.08] bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Selection bubble */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={picked ? `Un-pick (slot ${slotIndex})` : 'Pick this'}
          className={`flex-shrink-0 w-7 h-7 rounded-full border inline-flex items-center justify-center text-[12px] font-bold tabular-nums transition-colors ${
            picked
              ? 'bg-violet-500/80 border-violet-300/60 text-white'
              : 'border-white/[0.20] text-white/30 hover:border-white/40 hover:text-white/60'
          }`}
        >
          {picked ? slotIndex : '○'}
        </button>

        {/* Main row body — tappable to toggle pick */}
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded ${meta.bg} ${meta.text} text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5`}>
              <Icon size={9} />
              {meta.label}
            </span>
            <span className={`text-[12px] font-semibold truncate ${dim ? 'text-white/85' : 'text-white'}`}>
              {pick.title}
            </span>
          </div>
        </button>

        {/* Leverage pill */}
        {score != null && (
          <span className={`flex-shrink-0 text-[10px] tabular-nums ${
            isFallback ? 'text-amber-300' : score >= 80 ? 'text-emerald-300' : score >= 60 ? 'text-white/55' : 'text-white/35'
          }`}>
            {isFallback ? 'fallback' : `lev ${score}`}
          </span>
        )}

        {/* Chevron */}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center text-white/40 hover:text-white/80"
        >
          <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (pick.why_now || pick.reasoning) && (
        <div className="border-t border-white/[0.06] px-3 py-2.5 space-y-1.5">
          {pick.why_now && <p className="text-[11px] text-white/65 leading-snug">{pick.why_now}</p>}
          {pick.reasoning && <p className="text-[10px] text-white/45 italic leading-snug">{pick.reasoning}</p>}
        </div>
      )}
    </div>
  )
}

function SelectedSlot({
  n, pick, onChangeText, onRemove,
}: {
  n: number
  pick: Pick
  onChangeText: (t: string) => void
  onRemove: () => void
}) {
  const isCustom = pick.kind === 'custom'
  // Marcus picks show their title statically by default but Krish can edit
  // — editing flips the source to krish_swapped on submit.
  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-9 flex items-center justify-center text-[12px] text-violet-200 font-bold tabular-nums flex-shrink-0">{n}.</div>
      <div className="flex-1 min-w-0">
        {isCustom ? (
          <CustomTextarea value={pick.text} onChange={onChangeText} />
        ) : (
          <input
            type="text"
            value={pick.text}
            onChange={(e) => onChangeText(e.target.value)}
            className="w-full bg-black/30 border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:border-violet-400/50 focus:outline-none"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="h-9 px-2 text-white/40 hover:text-white/70 flex-shrink-0"
        aria-label="Remove"
      >
        <X size={13} />
      </button>
    </div>
  )
}

function CustomTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const { toast } = useToast()
  const canRecord = browserCanRecord()

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
        await sendToWhisper(blob)
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch {
      toast('Microphone access denied. Type instead.', 'error')
    }
  }

  const stopRecord = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    setRecording(false)
  }

  const sendToWhisper = async (blob: Blob) => {
    setTranscribing(true)
    try {
      const r = await fetch('/api/daily-focus/voice', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })
      const j = await r.json().catch(() => ({}))
      if (j.ok && j.text) {
        onChange(value ? `${value} ${j.text}` : j.text)
      } else {
        toast('Voice transcription unavailable. Type instead.', 'error')
      }
    } catch {
      toast('Voice transcription failed. Type instead.', 'error')
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What would shipping this look like by EOD?"
        rows={2}
        className="w-full bg-black/30 border border-white/[0.08] rounded-md px-3 py-2 pr-10 text-[13px] text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none resize-none"
      />
      {canRecord && (
        <button
          type="button"
          onClick={recording ? stopRecord : startRecord}
          disabled={transcribing}
          aria-label={recording ? 'Stop recording' : 'Record'}
          className={`absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
            recording
              ? 'bg-rose-500/30 border border-rose-400/50 text-rose-100 animate-pulse'
              : 'text-white/45 hover:text-white/85'
          } disabled:opacity-50`}
        >
          {transcribing ? <Loader2 size={12} className="animate-spin" /> : (recording ? <Square size={11} /> : <Mic size={12} />)}
        </button>
      )}
    </div>
  )
}
