import React, { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, Check, X } from 'lucide-react'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'

// Phase 1 of focus + tasks inbox brief. Renders only when no daily_focus
// row exists for today and no carry-over is in progress. Three slots,
// optional voice input via Whisper, Marcus's nominated picks visible as
// chips, "Lock today's 3" submits the calibration.

interface Suggestion {
  kind?: string
  title: string
  why_now?: string
  action_label?: string
  action_kind?: string
  action_target_id?: string | null
}

interface SuggestionsPayload {
  marcus_top_three: Suggestion[]
  additional_candidates: Suggestion[]
}

interface CalibrateBody {
  date: string
  targets: Array<{
    text: string
    source: 'marcus_nominated' | 'krish_swapped' | 'krish_added'
    replaced_marcus_pick?: Suggestion | null
  }>
}

interface SlotState {
  text: string
  source: 'marcus_nominated' | 'krish_swapped' | 'krish_added' | null
  replaced_marcus_pick: Suggestion | null
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

export function FocusCalibrator({ onLocked }: { onLocked?: () => void } = {}) {
  const { today, carry_over, loading } = useDailyFocus()
  const [suggestions, setSuggestions] = useState<SuggestionsPayload>({ marcus_top_three: [], additional_candidates: [] })
  const [showMore, setShowMore]   = useState(false)
  const [slots, setSlots] = useState<SlotState[]>([
    { text: '', source: null, replaced_marcus_pick: null },
    { text: '', source: null, replaced_marcus_pick: null },
    { text: '', source: null, replaced_marcus_pick: null },
  ])
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
            additional_candidates: j.additional_candidates || [],
          })
        }
      } catch { /* leave empty */ }
    })()
  }, [])

  if (!isFocusEnabled()) return null
  if (loading) return null
  if (today) return null

  const fillSlot = (text: string, source: SlotState['source'], pick: Suggestion | null) => {
    setSlots(prev => {
      const next = [...prev]
      const empty = next.findIndex(s => !s.text.trim())
      const idx = empty >= 0 ? empty : 0
      next[idx] = { text, source, replaced_marcus_pick: pick }
      return next
    })
  }

  const updateSlotText = (i: number, text: string) => {
    setSlots(prev => {
      const next = [...prev]
      const wasFilledByMarcus = next[i].source === 'marcus_nominated'
      next[i] = {
        text,
        source: text.trim() === '' ? null : (wasFilledByMarcus ? 'krish_swapped' : (next[i].source || 'krish_added')),
        replaced_marcus_pick: wasFilledByMarcus ? next[i].replaced_marcus_pick : null,
      }
      return next
    })
  }

  const submit = async () => {
    if (submitting) return
    if (slots.some(s => !s.text.trim())) {
      toast('Fill all 3 targets before locking.', 'error'); return
    }
    setSubmitting(true)
    h.tap()
    try {
      const body: CalibrateBody = {
        date: ymd(new Date()),
        targets: slots.map(s => ({
          text: s.text.trim(),
          source: (s.source as 'marcus_nominated' | 'krish_swapped' | 'krish_added') || 'krish_added',
          replaced_marcus_pick: s.replaced_marcus_pick,
        })),
      }
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

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-5">
      <header className="mb-4">
        <h2 className="text-[16px] font-semibold text-white">What are your 3 today?</h2>
        <p className="text-[12px] text-white/55 mt-1">
          Pick three things you will ship today. Everything else on Home gets demoted.
          {carry_over ? ' Yesterday is still open below.' : ''}
        </p>
      </header>

      {suggestions.marcus_top_three.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Marcus suggests</div>
          <div className="flex gap-2 flex-wrap">
            {suggestions.marcus_top_three.map((s, i) => (
              <button
                key={`m-${i}`}
                type="button"
                onClick={() => { h.tap(); fillSlot(s.title, 'marcus_nominated', s) }}
                className="text-left bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg px-3 py-2 max-w-[280px] transition-colors"
              >
                <div className="text-[10px] uppercase tracking-wider text-violet-300">{s.kind || 'pick'}</div>
                <div className="text-[12px] font-semibold text-white truncate">{s.title}</div>
                {s.why_now && <div className="text-[11px] text-white/55 truncate">{s.why_now}</div>}
              </button>
            ))}
            {suggestions.additional_candidates.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMore(v => !v)}
                className="text-[11px] text-white/55 hover:text-white/85 px-2"
              >
                {showMore ? 'less' : `+${suggestions.additional_candidates.length} more`}
              </button>
            )}
          </div>
          {showMore && (
            <div className="flex gap-2 flex-wrap mt-2 opacity-75">
              {suggestions.additional_candidates.map((s, i) => (
                <button
                  key={`a-${i}`}
                  type="button"
                  onClick={() => { h.tap(); fillSlot(s.title, 'marcus_nominated', s) }}
                  className="text-left bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] rounded-md px-2.5 py-1.5 max-w-[260px]"
                >
                  <div className="text-[11px] text-white/85 truncate">{s.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {slots.map((s, i) => (
          <Slot
            key={i}
            n={i + 1}
            value={s.text}
            onChange={(v) => updateSlotText(i, v)}
            onClear={() => setSlots(prev => { const n = [...prev]; n[i] = { text: '', source: null, replaced_marcus_pick: null }; return n })}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || slots.some(s => !s.text.trim())}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-100 bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/40 rounded-md px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {submitting ? "Locking..." : "Lock today's 3"}
        </button>
      </div>
    </section>
  )
}

function Slot({
  n, value, onChange, onClear,
}: {
  n: number
  value: string
  onChange: (v: string) => void
  onClear: () => void
}) {
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
    <div className="flex items-start gap-2">
      <div className="w-6 h-9 flex items-center justify-center text-[11px] text-white/45 font-semibold">{n}.</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Target ${n}: what would shipping this look like by EOD?`}
        className="flex-1 bg-black/30 border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="h-9 px-2 text-white/40 hover:text-white/70"
          aria-label="Clear"
        >
          <X size={13} />
        </button>
      )}
      {canRecord && (
        <button
          type="button"
          onClick={recording ? stopRecord : startRecord}
          disabled={transcribing}
          aria-label={recording ? 'Stop recording' : 'Record'}
          className={`h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors ${
            recording
              ? 'bg-rose-500/30 border-rose-400/50 text-rose-100 animate-pulse'
              : 'bg-white/[0.04] border-white/[0.08] text-white/60 hover:text-white/90'
          } disabled:opacity-50`}
        >
          {transcribing ? <Loader2 size={13} className="animate-spin" /> : (recording ? <Square size={12} /> : <Mic size={13} />)}
        </button>
      )}
    </div>
  )
}
