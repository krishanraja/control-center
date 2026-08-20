import React, { useEffect, useState } from 'react'
import type { PilotAsk, PilotAskOutcome } from '../../types/pilot'
import { useAskState, saveAsk, resolveAsk } from '../../hooks/useAsks'
import { useHaptics } from '../../hooks/useHaptics'
import { Skeleton } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { Tap, VoiceField } from '../pilot/controls'
import {
  ASK_PLACEHOLDER, PREDICTION_CHIPS, OUTCOME_CHIPS,
  findSelfRejection, selfRejectionHint, learningFor,
} from '../../content/focusTheory'

// The day's rep: one clean ask. The number one intervention in the operating
// manual, and the whole spine of the Focus & Purpose home.
//
// Three states, one visible at a time: compose (write it, predict the answer),
// committed (send it, then say it went out), out (nothing more asked of him).
// An unresolved ask from a PAST day surfaces above, one at a time, because a
// prediction only teaches anything when it meets its outcome.
//
// What this card never does: list past asks, count streaks, chart outcomes, or
// prompt twice for the same thing. The learning is one sentence and then the
// review is over.

interface Props {
  variant: 'desktop' | 'mobile'
  /** Steady's "write the ask" handoff lands here: focus the compose field. */
  composeSignal?: number
}

export function AskCard({ variant, composeSignal }: Props) {
  const h = useHaptics()
  const { state, loading, refresh } = useAskState()
  const [text, setText] = useState('')
  const [predicted, setPredicted] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The one-line learning shown right where the outcome was tapped, held only
  // until the card re-renders without the resolved ask. Component state, never
  // persisted: the lesson is read once, not collected.
  const [learning, setLearning] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const waiting = useDeferredPending(loading)

  const today = state?.today_ask ?? null

  // Steady's handoff. A change in the signal means "the move is the ask":
  // switch the card into compose and let the field take the eye.
  useEffect(() => {
    if (composeSignal && composeSignal > 0) setEditing(true)
  }, [composeSignal])

  useEffect(() => {
    if (today && !editing) {
      setText(today.ask_text)
      setPredicted(today.predicted_no_pct)
    }
  }, [today?.id])

  const commit = async (markSent: boolean) => {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      await saveAsk({ ask_text: text.trim(), predicted_no_pct: predicted, mark_sent: markSent })
      markSent ? h.notifySuccess() : h.impactMedium()
      setEditing(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const resolve = async (ask: PilotAsk, outcome: PilotAskOutcome) => {
    h.select()
    setLearning(learningFor(outcome, ask.predicted_no_pct))
    try { await resolveAsk(ask.id, outcome) } catch { /* the line already landed; a retry can come from a reload */ }
    refresh()
  }

  if (loading) {
    return <Skeleton quiet={!waiting} h={variant === 'mobile' ? 168 : 188} r={16} className="border border-white/[0.06]" />
  }

  const compact = variant === 'mobile'
  const softener = findSelfRejection(text)
  const composing = !today || editing

  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] ${compact ? 'p-4' : 'p-5'} flex flex-col gap-4`}>

      {/* An ask from a past day, still waiting on reality. One at a time. */}
      {state?.unresolved && !learning && (
        <div className="flex flex-col gap-2.5 pb-4 border-b border-white/[0.06]">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Still out there</span>
          <p className="text-[13px] leading-relaxed text-ink">{state.unresolved.ask_text}</p>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOME_CHIPS.map(({ outcome, label }) => (
              <button
                key={outcome}
                type="button"
                onPointerDown={() => h.select()}
                onClick={() => resolve(state.unresolved as PilotAsk, outcome)}
                className="min-h-[44px] px-3.5 rounded-xl text-[13px] bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The outcome met the prediction. One sentence, then it is over. */}
      {learning && (
        <p className="text-[13px] leading-relaxed text-ink-muted pb-4 border-b border-white/[0.06]">{learning}</p>
      )}

      {composing ? (
        <>
          <div>
            <h2 className="font-display text-[19px] leading-tight text-ink">Today&rsquo;s ask</h2>
            <p className="text-[12px] text-ink-faint mt-1">One clean request. No apology, one easy decline.</p>
          </div>
          <VoiceField value={text} onChange={setText} rows={2} placeholder={ASK_PLACEHOLDER} />
          {softener && (
            <p className="text-[12px] text-ink-muted leading-relaxed">{selfRejectionHint(softener)}</p>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-ink-muted">If you send it, how do they answer?</span>
            <div className="flex flex-wrap gap-1.5">
              {PREDICTION_CHIPS.map(({ pct, label }) => (
                <button
                  key={pct}
                  type="button"
                  onPointerDown={() => h.select()}
                  onClick={() => setPredicted(predicted === pct ? null : pct)}
                  className={`min-h-[44px] px-3.5 rounded-xl text-[13px] border transition-all active:scale-95 touch-manipulation ${
                    predicted === pct
                      ? 'bg-white/[0.12] border-white/30 text-ink'
                      : 'bg-white/[0.03] border-white/10 text-ink-muted hover:bg-white/[0.07]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[12px] text-ink-muted">{error}</p>}
          <div className="flex items-center gap-2">
            <Tap onTap={() => commit(false)} disabled={saving || !text.trim()} feel="impactMedium" className="flex items-center justify-center">
              {saving ? 'Saving' : 'Commit the ask'}
            </Tap>
            {editing && today && (
              <Tap variant="quiet" className="!min-h-[48px] text-[13px] flex items-center" onTap={() => { h.tap(); setEditing(false); setText(today.ask_text); setPredicted(today.predicted_no_pct) }}>
                Cancel
              </Tap>
            )}
          </div>
        </>
      ) : today && !today.sent_at ? (
        <>
          <div>
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Today&rsquo;s ask</span>
            <p className="mt-2 font-display text-[17px] leading-snug text-ink">{today.ask_text}</p>
            {today.predicted_no_pct !== null && (
              <p className="mt-1.5 text-[12px] text-ink-faint">Your prediction: {today.predicted_no_pct}% chance of a no.</p>
            )}
          </div>
          {error && <p className="text-[12px] text-ink-muted">{error}</p>}
          <div className="flex items-center gap-2">
            <Tap onTap={() => commit(true)} disabled={saving} feel="success" className="flex items-center justify-center">
              It went out
            </Tap>
            <Tap variant="quiet" className="!min-h-[48px] text-[13px] flex items-center" onTap={() => { h.tap(); setEditing(true) }}>
              Edit
            </Tap>
          </div>
        </>
      ) : today && !today.resolved_at ? (
        <>
          <div>
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Out</span>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{today.ask_text}</p>
            <p className="mt-1.5 text-[12px] text-ink-faint">In the ledger. Nothing else is asked of you here.</p>
          </div>
          {recording ? (
            <div className="flex flex-wrap gap-1.5">
              {OUTCOME_CHIPS.map(({ outcome, label }) => (
                <button
                  key={outcome}
                  type="button"
                  onPointerDown={() => h.select()}
                  onClick={() => { setRecording(false); resolve(today, outcome) }}
                  className="min-h-[44px] px-3.5 rounded-xl text-[13px] bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { h.tap(); setRecording(true) }}
              className="self-start min-h-[44px] text-[12px] text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
            >
              Record what came back
            </button>
          )}
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Today&rsquo;s ask is made and answered. That was the rep.
        </p>
      )}
    </div>
  )
}
