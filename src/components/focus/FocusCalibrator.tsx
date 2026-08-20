import React, { useEffect, useRef, useState } from 'react'
import {
  Mic, Square, Check, X, ChevronDown, Plus, ThumbsDown,
  TrendingUp, Sparkles as SparkleIcon, AlertTriangle, Target,
} from 'lucide-react'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { usePilotStateContext } from '../../contexts/PilotStateContext'
import { rankByIntent } from '../../lib/pilotCapacity'
import { civilYmd } from '../../lib/civilDate'
import { Working } from '../shared/Working'

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
  // Weekly linkage (Phase 2): set when this pick's task advances a milestone
  // Krish committed for the current week. Populated by /api/daily-focus/suggestions.
  serves_milestone?: { id: string; title: string; goal_id: string; goal_title: string | null } | null
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
  return civilYmd(d)
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

export function FocusCalibrator({ onLocked, pilotOne }: {
  onLocked?: () => void
  /** Last night's shutdown ONE, seeded as the first slot. See the effect below. */
  pilotOne?: string | null
} = {}) {
  const { today, carry_over, loading } = useDailyFocus()
  const [suggestions, setSuggestions] = useState<SuggestionsPayload>({
    marcus_top_three: [], marcus_alternates: [], marcus_reasoning: null,
  })
  const [picks, setPicks] = useState<Pick[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Marcus suggestion keys Krish has thumbs-downed this session. Dim + lock
  // the bubble so he can't accidentally pick something he just rejected.
  const [unsuitable, setUnsuitable] = useState<Set<string>>(new Set())
  // Which row is currently composing a thumbs-down reason (only one at a
  // time — opens the expanded panel with a reason textarea).
  const [composingDownFor, setComposingDownFor] = useState<string | null>(null)
  const [submittingDownFor, setSubmittingDownFor] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const h = useHaptics()
  const { toast } = useToast()
  const pilot = usePilotStateContext()

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

  // One commitment, not two.
  //
  // The pilot layer's evening shutdown already picks tomorrow's ONE, at higher
  // capacity, the night before. Until now that lived in pilot_checkins and the
  // morning lock lived in daily_focus, so the operator held two daily
  // commitments on two different clocks that could disagree. Seeding it as the
  // first slot makes them the same object: red mode runs on slot 1, and a
  // higher-capacity day simply asks for more slots after it.
  //
  // It seeds once, and only into an empty picker, so it can always be un-picked.
  const seededOne = useRef(false)
  useEffect(() => {
    if (seededOne.current) return
    const one = pilotOne?.trim()
    if (!one) return
    seededOne.current = true
    setPicks(prev => (prev.length > 0 ? prev : [{ kind: 'custom', text: one, id: 'pilot-one' }]))
  }, [pilotOne])

  if (!isFocusEnabled()) return null
  if (loading) return null
  if (today) return null

  // How many targets today asks for. Capacity only ever lowers this. The daily
  // altitude is never suppressed to zero: one commitment is the floor, and it
  // is the same floor red mode already runs on.
  const targetCount = pilot.profile.targets

  // Flatten Marcus's 7 picks (3 primary + up to 4 alternates) into a single
  // ordered list. Stable key per row.
  // Ranked for what today is actually for: entries whose kind matches the
  // morning intent rise above the rest, then leverage decides. A matched
  // alternate can outrank an unmatched primary, which is the point of asking
  // what the day is for at check-in.
  const allPicks: Array<{ s: Suggestion; key: string; tier: 'primary' | 'alternate'; kind?: string; leverage_score?: number | null }> =
    rankByIntent(
      [
        ...suggestions.marcus_top_three.map((s, i) => ({ s, key: suggestionKey(s, i),       tier: 'primary' as const,   kind: s.kind, leverage_score: s.leverage_score })),
        ...suggestions.marcus_alternates.map((s, i) => ({ s, key: suggestionKey(s, 100 + i), tier: 'alternate' as const, kind: s.kind, leverage_score: s.leverage_score })),
      ],
      pilot.intent,
    )

  const marcusPickIndex = new Map<string, number>() // key → slot number
  picks.forEach((p, i) => {
    if (p.kind === 'marcus' && p.suggestion) {
      const k = suggestionKey(p.suggestion, -1)
      marcusPickIndex.set(k, i + 1)
    }
  })

  const canLock = picks.length === targetCount && picks.every(p => p.text.trim().length > 0) && !submitting

  const toggleMarcus = (s: Suggestion, key: string) => {
    if (unsuitable.has(key)) return // Row is locked after thumbs-down.
    setPicks(prev => {
      const existing = prev.findIndex(p => p.kind === 'marcus' && p.suggestion && suggestionKey(p.suggestion, -1) === key)
      if (existing >= 0) {
        // Un-pick — slots renumber automatically by index.
        h.tap()
        return prev.filter((_, i) => i !== existing)
      }
      if (prev.length >= targetCount) {
        // At cap — tell Krish to un-pick first.
        toast(`Already at ${targetCount}. Un-pick one first.`, 'error')
        h.error()
        return prev
      }
      h.tap()
      return [...prev, { kind: 'marcus', suggestion: s, text: s.title, id: key }]
    })
  }

  const startComposeDown = (key: string) => {
    if (unsuitable.has(key)) return
    h.tap()
    // Opening the reason composer also expands the row so the textarea has room.
    setExpanded(prev => { const next = new Set(prev); next.add(key); return next })
    setComposingDownFor(key)
  }

  const cancelComposeDown = () => {
    h.tap()
    setComposingDownFor(null)
  }

  const submitThumbsDown = async (s: Suggestion, key: string, reason: string) => {
    const trimmed = reason.trim()
    if (!trimmed) {
      toast('Add a quick reason so Marcus learns the pattern.', 'error')
      return
    }
    setSubmittingDownFor(key)
    h.tap()
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: 'home_intelligence',
          source_id: s.action_target_id || key,
          agent_id: 'marcus',
          vote: -1,
          reason_code: 'marcus_suggestion_unsuitable',
          reason_text: trimmed,
          meta: {
            pick_kind: s.kind || null,
            pick_title: s.title,
            pick_action_kind: s.action_kind || null,
            leverage_score: typeof s.leverage_score === 'number' ? s.leverage_score : null,
            reasoning: s.reasoning || null,
            captured_at: new Date().toISOString(),
            picker_phase: 'pre_lock',
          },
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'unknown')
      // Un-pick this card if it was selected — you don't want it ghosting in Today's 3.
      setPicks(prev => prev.filter(p => !(p.kind === 'marcus' && p.suggestion && suggestionKey(p.suggestion, -1) === key)))
      setUnsuitable(prev => { const next = new Set(prev); next.add(key); return next })
      setComposingDownFor(null)
      h.success()
      toast('Marked unsuitable. Marcus will learn.', 'success')
    } catch (e) {
      h.error()
      toast(`Could not capture feedback: ${(e as Error).message}`, 'error')
    } finally {
      setSubmittingDownFor(null)
    }
  }

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const addCustom = () => {
    if (picks.length >= targetCount) {
      toast(`Already at ${targetCount}. Un-pick one first.`, 'error')
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
          Pick from Marcus&rsquo;s leverage picks below, add your own, or mix. Lock {targetCount} and Home recalibrates.
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
                unsuitable={unsuitable.has(key)}
                composing={composingDownFor === key}
                submittingDown={submittingDownFor === key}
                onToggle={() => toggleMarcus(s, key)}
                onToggleExpand={() => toggleExpand(key)}
                onStartThumbsDown={() => startComposeDown(key)}
                onCancelThumbsDown={cancelComposeDown}
                onSubmitThumbsDown={(reason) => submitThumbsDown(s, key, reason)}
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
            disabled={picks.length >= targetCount}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/70 hover:text-white border border-white/[0.08] rounded-md px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={11} />
            Add your own
          </button>
          {picks.length >= targetCount && (
            <span className="text-[10px] text-white/45">{targetCount}/{targetCount} · un-pick to swap</span>
          )}
          {picks.length < targetCount && (
            <span className="text-[10px] text-white/45 tabular-nums">{picks.length}/{targetCount}</span>
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
          {submitting ? <Working size={12} /> : <Check size={12} />}
          {submitting ? 'Locking...' : `Lock today's ${targetCount}`}
        </button>
      </div>
    </section>
  )
}

function MarcusPickRow({
  pick, slotIndex, expanded, dim, unsuitable, composing, submittingDown,
  onToggle, onToggleExpand, onStartThumbsDown, onCancelThumbsDown, onSubmitThumbsDown,
}: {
  pick: Suggestion
  slotIndex: number | null
  expanded: boolean
  dim: boolean
  unsuitable: boolean
  composing: boolean
  submittingDown: boolean
  onToggle: () => void
  onToggleExpand: () => void
  onStartThumbsDown: () => void
  onCancelThumbsDown: () => void
  onSubmitThumbsDown: (reason: string) => void
}) {
  const kind = (pick.kind || '').toLowerCase()
  const meta = KIND_META[kind] || { label: pick.kind || 'pick', bg: 'bg-white/10', text: 'text-white/70', Icon: SparkleIcon }
  const Icon = meta.Icon
  const score = typeof pick.leverage_score === 'number' ? pick.leverage_score : null
  const isFallback = score === 0
  const picked = slotIndex != null
  const [reason, setReason] = useState('')

  // Reset the local draft if the composer closes (cancel or successful submit).
  useEffect(() => { if (!composing) setReason('') }, [composing])

  return (
    <div
      className={`rounded-lg border transition-colors ${
        unsuitable
          ? 'border-white/[0.05] bg-white/[0.015] opacity-55'
          : picked
            ? 'border-violet-400/45 bg-violet-500/[0.07]'
            : dim
              ? 'border-white/[0.06] bg-white/[0.02]'
              : 'border-white/[0.08] bg-white/[0.04]'
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Selection bubble — disabled when row is marked unsuitable */}
        <button
          type="button"
          onClick={onToggle}
          disabled={unsuitable}
          aria-label={
            unsuitable ? 'Marked unsuitable' : picked ? `Un-pick (slot ${slotIndex})` : 'Pick this'
          }
          className={`flex-shrink-0 w-7 h-7 rounded-full border inline-flex items-center justify-center text-[12px] font-bold tabular-nums transition-colors ${
            unsuitable
              ? 'border-white/[0.10] text-white/20 cursor-not-allowed'
              : picked
                ? 'bg-violet-500/80 border-violet-300/60 text-white'
                : 'border-white/[0.20] text-white/30 hover:border-white/40 hover:text-white/60'
          }`}
        >
          {picked ? slotIndex : unsuitable ? <ThumbsDown size={11} /> : '○'}
        </button>

        {/* Main row body — tappable to toggle pick (or no-op if unsuitable) */}
        <button
          type="button"
          onClick={onToggle}
          disabled={unsuitable}
          className="flex-1 min-w-0 text-left disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded ${meta.bg} ${meta.text} text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5`}>
              <Icon size={9} />
              {meta.label}
            </span>
            <span className={`text-[12px] font-semibold truncate ${dim ? 'text-white/85' : 'text-white'} ${unsuitable ? 'line-through' : ''}`}>
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

        {/* Thumbs-down — opens an inline reason composer */}
        <button
          type="button"
          onClick={onStartThumbsDown}
          disabled={unsuitable || composing}
          aria-label={unsuitable ? 'Already marked unsuitable' : 'Mark unsuitable'}
          title="Mark unsuitable"
          className={`flex-shrink-0 w-7 h-7 inline-flex items-center justify-center transition-colors ${
            unsuitable
              ? 'text-rose-300/60'
              : 'text-white/35 hover:text-rose-300'
          } disabled:cursor-not-allowed`}
        >
          <ThumbsDown size={13} />
        </button>

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

      {/* Weekly linkage: this pick advances a milestone committed this week. */}
      {pick.serves_milestone && !unsuitable && (
        <div className="px-3 pb-2 -mt-0.5">
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-200/85 bg-violet-500/15 border border-violet-400/20 rounded px-1.5 py-0.5">
            <Target size={9} /> Serves this week: {pick.serves_milestone.title}
          </span>
        </div>
      )}

      {/* Unsuitable label — replaces the body when row is marked. */}
      {unsuitable && !composing && (
        <div className="border-t border-white/[0.06] px-3 py-2 text-[10px] text-rose-200/70 italic">
          Marked unsuitable — Marcus will learn.
        </div>
      )}

      {/* Reason composer for thumbs-down */}
      {composing && !unsuitable && (
        <div className="border-t border-rose-400/20 px-3 py-2.5 space-y-2 bg-rose-500/[0.04]">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-rose-200/80">
            Why is this unsuitable?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmitThumbsDown(reason)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onCancelThumbsDown()
              }
            }}
            disabled={submittingDown}
            rows={2}
            autoFocus
            placeholder="e.g. wrong category, already shipping, low ROI on this lead profile…"
            className="w-full bg-black/30 border border-white/[0.10] rounded-md px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/25 focus:border-rose-400/40 focus:outline-none resize-none disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelThumbsDown}
              disabled={submittingDown}
              className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white/85 px-2 py-1 rounded disabled:opacity-60"
            >
              <X size={11} />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmitThumbsDown(reason)}
              disabled={submittingDown || !reason.trim()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-100 bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 rounded-md px-2.5 py-1 disabled:opacity-50"
            >
              {submittingDown ? <Working size={11} /> : <ThumbsDown size={11} />}
              {submittingDown ? 'Sending…' : 'Mark unsuitable'}
            </button>
          </div>
        </div>
      )}

      {/* Default expansion — why_now + reasoning. Hidden while composing so
          the textarea doesn't compete for attention. */}
      {expanded && !composing && !unsuitable && (pick.why_now || pick.reasoning) && (
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
          {transcribing ? <Working size={12} /> : (recording ? <Square size={11} /> : <Mic size={12} />)}
        </button>
      )}
    </div>
  )
}
