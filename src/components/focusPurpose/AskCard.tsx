import React, { useEffect, useState } from 'react'
import type { PilotAsk, PilotAskOutcome } from '../../types/pilot'
import { useAskState, saveAsk, resolveAsk } from '../../hooks/useAsks'
import { useHaptics } from '../../hooks/useHaptics'
import { Skeleton } from '../shared/Skeleton'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { Eyebrow } from '../shared/Eyebrow'
import { useDeferredPending } from '../shared/useDeferredPending'
import { Tap, VoiceField } from '../pilot/controls'
import { AskWho } from './AskWho'
import { copyText } from '../../lib/contactAction'
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
  /**
   * The strategist's one move (ADR-026): wording drafted for him, which he
   * edits and then makes today's ask with his OWN prediction. The chips start
   * empty on purpose: a machine-filled prediction would make learningFor() tell
   * him about a guess he never made. Once today's ask has gone out the seed is
   * offered with Copy only, because the server refuses to overwrite a sent ask
   * (409 already_sent) and the card should not offer what the server refuses.
   */
  seed?: { text: string; suggestionId: string | null }
  /** Called once the seeded wording is saved as today's ask. */
  onCommitted?: (finalText: string, predictedNoPct: number | null) => void
  /** Leave out the past day's unresolved ask (a read is not the place for it). */
  hideUnresolved?: boolean
  /**
   * Render through the house hero (DoThisNextHero, layout="card"), one step at
   * a time: Focus's spine (Krish, 2026-10-05: Growth is the standard). A past
   * day's unresolved ask is then the step before today's, never a second
   * action stacked above it; "Answer it later" steps past it, and after an
   * answer the lesson lands where he pressed and "Next" is a press. The
   * strategist's seeded ask keeps the plain card.
   */
  hero?: boolean
}

export function AskCard({ variant, composeSignal, seed, onCommitted, hideUnresolved, hero = false }: Props) {
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
  // Hero mode: he stepped past the unresolved ask for now.
  const [deferred, setDeferred] = useState(false)
  const waiting = useDeferredPending(loading)
  // The seed stays in charge of the card until it is saved (or refused as
  // already sent); after that the card is plain today's ask again.
  const [seedDone, setSeedDone] = useState(false)
  const [alreadySent, setAlreadySent] = useState(false)
  const [copied, setCopied] = useState(false)
  const seeding = Boolean(seed?.text) && !seedDone

  const today = state?.today_ask ?? null

  useEffect(() => {
    if (!seed?.text) return
    setText(seed.text)
    setPredicted(null)
    setSeedDone(false)
    setAlreadySent(false)
    setCopied(false)
    setError(null)
  }, [seed?.text, seed?.suggestionId])

  // Steady's handoff. A change in the signal means "the move is the ask":
  // switch the card into compose and let the field take the eye.
  useEffect(() => {
    if (composeSignal && composeSignal > 0) setEditing(true)
  }, [composeSignal])

  useEffect(() => {
    if (today && !editing && !seeding) {
      setText(today.ask_text)
      setPredicted(today.predicted_no_pct)
    }
  }, [today?.id])

  const commit = async (markSent: boolean) => {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    const finalText = text.trim()
    try {
      await saveAsk({ ask_text: finalText, predicted_no_pct: predicted, mark_sent: markSent })
      markSent ? h.notifySuccess() : h.impactMedium()
      setEditing(false)
      if (seeding) {
        setSeedDone(true)
        onCommitted?.(finalText, predicted)
      }
      await refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      // The server's refusal to overwrite an ask that already went out
      // (api/pilot/asks.ts). Said plainly, with the wording kept to copy.
      if (/already_sent/.test(message)) {
        h.error()
        if (seeding) {
          setAlreadySent(true)
        } else {
          setEditing(false)
          setError('Today’s ask had already gone out, so it was not replaced.')
        }
        await refresh()
      } else {
        setError(message || 'Could not save')
      }
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    const ok = await copyText(text.trim())
    setCopied(ok)
    if (ok) h.success()
    else setError('Could not reach the clipboard. Select the words and copy them by hand.')
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

  if (hero && !seeding) {
    const outcomeChips = (onPick: (o: PilotAskOutcome) => void) => (
      <div className="flex flex-wrap gap-1.5">
        {OUTCOME_CHIPS.map(({ outcome, label }) => (
          <button
            key={outcome}
            type="button"
            onPointerDown={() => h.select()}
            onClick={() => onPick(outcome)}
            className="min-h-[44px] px-3.5 rounded-xl text-body bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
          >
            {label}
          </button>
        ))}
      </div>
    )
    const quiet = '!min-h-[48px] text-body flex items-center'
    const eyebrow = (word: string) => <Eyebrow tone="accent">{word}</Eyebrow>

    // 1. A past day's ask, still waiting on reality, is the step before today's.
    if (state?.unresolved && !learning && !hideUnresolved && !deferred) {
      const past = state.unresolved
      return (
        <DoThisNextHero
          layout="card" narrow={compact} testId="ask-unresolved"
          eyebrow={eyebrow('Waiting on a reply')}
          descriptor={{ headline: past.ask_text, sub: 'What came back? Your guess only teaches you something once it meets the answer.' }}
        >
          {outcomeChips(o => resolve(past, o))}
          <Tap variant="quiet" className={`${quiet} self-start`} onTap={() => { h.tap(); setDeferred(true) }}>Answer it later</Tap>
        </DoThisNextHero>
      )
    }

    // 2. The answer met the guess: one sentence, where he pressed. Next is a press.
    if (learning) {
      return (
        <DoThisNextHero
          layout="card" narrow={compact} testId="ask-learning"
          eyebrow={eyebrow('What it taught')}
          descriptor={{ headline: learning, sub: '' }}
        >
          <Tap onTap={() => { h.tap(); setLearning(null) }} feel="impactMedium" className="self-start flex items-center justify-center">
            Next: today&rsquo;s ask
          </Tap>
        </DoThisNextHero>
      )
    }

    // 3. Compose today's ask.
    if (composing) {
      return (
        <DoThisNextHero
          layout="card" narrow={compact} testId="ask-compose"
          descriptor={{ headline: 'Today’s ask', sub: 'Ask one person for one thing. Give them an easy way to say no.' }}
        >
          <VoiceField value={text} onChange={setText} rows={2} placeholder={ASK_PLACEHOLDER} />
          {softener && <p className="text-label text-ink-muted leading-relaxed">{selfRejectionHint(softener)}</p>}
          <AskWho compact={compact} onUse={t => { setText(t); setPredicted(null) }} />
          {text.trim() !== '' && (
            <div className="flex flex-col gap-2">
              <span className="text-label text-ink-muted">Your guess: how likely is a yes?</span>
              <div className="grid grid-cols-4 gap-1.5">
                {PREDICTION_CHIPS.map(({ pct, label }) => (
                  <button
                    key={pct}
                    type="button"
                    data-testid={`ask-guess-${pct}`}
                    aria-pressed={predicted === pct}
                    onPointerDown={() => h.select()}
                    onClick={() => setPredicted(predicted === pct ? null : pct)}
                    className={`min-h-[44px] px-1 rounded-xl text-label leading-tight text-center border transition-all active:scale-95 touch-manipulation ${
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
          )}
          {error && <p className="text-label text-ink-muted">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Tap onTap={() => commit(false)} disabled={saving || !text.trim()} feel="impactMedium" className="flex items-center justify-center">
              {saving ? 'Saving' : 'Save the ask'}
            </Tap>
            {editing && today && (
              <Tap variant="quiet" className={quiet} onTap={() => { h.tap(); setEditing(false); setText(today.ask_text); setPredicted(today.predicted_no_pct) }}>
                Cancel
              </Tap>
            )}
          </div>
        </DoThisNextHero>
      )
    }

    // 4. Saved, not sent: send it, then say so.
    if (today && !today.sent_at) {
      return (
        <DoThisNextHero
          layout="card" narrow={compact} testId="ask-committed"
          eyebrow={eyebrow('Today’s ask')}
          descriptor={{
            headline: today.ask_text,
            sub: today.predicted_no_pct !== null
              ? `Your guess: ${100 - today.predicted_no_pct}% chance of a yes.`
              : 'Send it, then come back and say so.',
          }}
        >
          {error && <p className="text-label text-ink-muted">{error}</p>}
          <div className="flex items-center gap-2">
            <Tap onTap={() => commit(true)} disabled={saving} feel="success" className="flex items-center justify-center">I sent it</Tap>
            <Tap variant="quiet" className={quiet} onTap={() => { h.tap(); setEditing(true) }}>Edit</Tap>
          </div>
        </DoThisNextHero>
      )
    }

    // 5. Sent, waiting on the answer: nothing else is asked of him today.
    if (today && !today.resolved_at) {
      return (
        <DoThisNextHero
          layout="card" narrow={compact} testId="ask-sent"
          eyebrow={eyebrow('Sent')}
          descriptor={{ headline: today.ask_text, sub: 'Saved to your log. Nothing else to do here until they answer.', tone: 'neutral' }}
        >
          {error && <p className="text-label text-ink-muted">{error}</p>}
          {recording
            ? outcomeChips(o => { setRecording(false); resolve(today, o) })
            : <Tap variant="quiet" className={`${quiet} self-start`} onTap={() => { h.tap(); setRecording(true) }}>Record what came back</Tap>}
        </DoThisNextHero>
      )
    }

    // 6. Honest emptiness, said once.
    return (
      <DoThisNextHero
        narrow={compact}
        descriptor={{ clear: true, headline: 'Today’s ask is made and answered.', sub: 'Done for today.' }}
      />
    )
  }

  return (
    // The house card material (`.surface`), not a 3% wash of the page. The wash
    // never became a surface in either theme: on paper it was a 3% black tint of
    // warm paper, and on obsidian it was the translucency the card tokens were
    // rewritten to kill. Same fix as SectionCard, so the spine and the tools
    // beneath it read as one set of instruments.
    <div className={`surface rounded-2xl ${compact ? 'p-4 gap-3' : 'p-5 gap-4'} flex flex-col`}>

      {/* An ask from a past day, still waiting on reality. One at a time. */}
      {state?.unresolved && !learning && !hideUnresolved && (
        <div className="flex flex-col gap-2.5 pb-4 border-b border-white/[0.06]">
          <Eyebrow>Waiting on a reply</Eyebrow>
          <p className="text-body leading-relaxed text-ink">{state.unresolved.ask_text}</p>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOME_CHIPS.map(({ outcome, label }) => (
              <button
                key={outcome}
                type="button"
                onPointerDown={() => h.select()}
                onClick={() => resolve(state.unresolved as PilotAsk, outcome)}
                className="min-h-[44px] px-3.5 rounded-xl text-body bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The outcome met the prediction. One sentence, then it is over. */}
      {learning && (
        <p className="text-body leading-relaxed text-ink-muted pb-4 border-b border-white/[0.06]">{learning}</p>
      )}

      {seeding && (alreadySent || Boolean(today?.sent_at)) ? (
        // Today's ask has gone out. The drafted one is kept to copy, never
        // offered as a save the server would refuse.
        <div className="flex flex-col gap-3" data-testid="ask-seed-sent">
          <div>
            <Eyebrow>The move</Eyebrow>
            <p className="mt-2 text-ui leading-relaxed text-ink whitespace-pre-wrap break-words">{text}</p>
            <p className="mt-1.5 text-label text-ink-faint">
              {alreadySent
                ? 'Today\u2019s ask went out while this was open, so it was not replaced. Copy this one for tomorrow.'
                : 'Today\u2019s ask has already gone out. Copy this one for tomorrow.'}
            </p>
          </div>
          {error && <p className="text-label text-ink-muted">{error}</p>}
          <div className="flex items-center gap-2">
            <Tap onTap={() => void copy()} variant="secondary" className="flex items-center justify-center">
              {copied ? 'Copied' : 'Copy the wording'}
            </Tap>
          </div>
        </div>
      ) : seeding || composing ? (
        // One compose, for his own ask and for the strategist's seeded one
        // (ADR-026). The seed changes the words around the field and the
        // button, never the field, the softener hint or the guess chips, so
        // the two cannot drift apart. `contents` keeps his own ask's pieces
        // as direct children of the card, exactly as they were.
        <div className={seeding ? 'flex flex-col gap-3' : 'contents'} data-testid={seeding ? 'ask-seed-compose' : 'ask-compose'}>
          <div>
            <h2 className="font-display text-title leading-tight text-ink">Today&rsquo;s ask</h2>
            <p className="text-label text-ink-faint mt-1">
              {seeding
                ? 'Drafted from the read. Change anything until it sounds like you.'
                : 'Ask one person for one thing. Give them an easy way to say no.'}
            </p>
          </div>
          <VoiceField
            value={text}
            onChange={setText}
            rows={seeding ? (compact ? 4 : 3) : 2}
            placeholder={seeding ? undefined : ASK_PLACEHOLDER}
          />
          {softener && (
            <p className="text-label text-ink-muted leading-relaxed">{selfRejectionHint(softener)}</p>
          )}
          {/* The blank box is the hard half. Not offered over a seeded ask: the
              strategist has already named the move, and two proposers on one
              card is two answers to the same question. */}
          {!seeding && (
            <AskWho compact={compact} onUse={t => { setText(t); setPredicted(null) }} />
          )}
          {seeding && today && !today.sent_at && (
            <p className="text-label text-ink-faint leading-relaxed break-words">Today&rsquo;s ask now: {today.ask_text}</p>
          )}
          {/* The prediction appears once there is an ask to predict about.
              Leading with it was the single most confusing thing on this
              screen: an unexplained poll about a message not yet written.
              It starts empty for a seeded ask too: the guess is his. */}
          {text.trim() !== '' && (
            <div className="flex flex-col gap-2">
              <span className="text-label text-ink-muted">Your guess: how likely is a yes?</span>
              <div className="grid grid-cols-4 gap-1.5">
                {PREDICTION_CHIPS.map(({ pct, label }) => (
                  <button
                    key={pct}
                    type="button"
                    data-testid={`ask-guess-${pct}`}
                    aria-pressed={predicted === pct}
                    onPointerDown={() => h.select()}
                    onClick={() => setPredicted(predicted === pct ? null : pct)}
                    className={`min-h-[44px] px-1 rounded-xl text-label leading-tight text-center border transition-all active:scale-95 touch-manipulation ${
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
          )}
          {error && <p className="text-label text-ink-muted">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Tap onTap={() => commit(false)} disabled={saving || !text.trim()} feel="impactMedium" className="flex items-center justify-center">
              {saving
                ? 'Saving'
                : !seeding
                  ? 'Save the ask'
                  : today && !today.sent_at ? 'Replace today\u2019s ask' : 'Make it today\u2019s ask'}
            </Tap>
            {seeding ? (
              <Tap onTap={() => void copy()} variant="quiet" className="!min-h-[48px] text-body flex items-center">
                {copied ? 'Copied' : 'Copy'}
              </Tap>
            ) : editing && today && (
              <Tap variant="quiet" className="!min-h-[48px] text-body flex items-center" onTap={() => { h.tap(); setEditing(false); setText(today.ask_text); setPredicted(today.predicted_no_pct) }}>
                Cancel
              </Tap>
            )}
          </div>
        </div>
      ) : today && !today.sent_at ? (
        <>
          <div>
            <Eyebrow>Today&rsquo;s ask</Eyebrow>
            <p className="mt-2 font-display text-lede leading-snug text-ink">{today.ask_text}</p>
            {today.predicted_no_pct !== null && (
              <p className="mt-1.5 text-label text-ink-faint">Your guess: {100 - today.predicted_no_pct!}% chance of a yes.</p>
            )}
          </div>
          {error && <p className="text-label text-ink-muted">{error}</p>}
          <div className="flex items-center gap-2">
            <Tap onTap={() => commit(true)} disabled={saving} feel="success" className="flex items-center justify-center">
              I sent it
            </Tap>
            <Tap variant="quiet" className="!min-h-[48px] text-body flex items-center" onTap={() => { h.tap(); setEditing(true) }}>
              Edit
            </Tap>
          </div>
        </>
      ) : today && !today.resolved_at ? (
        <>
          <div>
            <Eyebrow>Sent</Eyebrow>
            <p className="mt-2 text-ui leading-relaxed text-ink-muted">{today.ask_text}</p>
            <p className="mt-1.5 text-label text-ink-faint">Saved to your log. Nothing else to do here.</p>
            {error && <p className="mt-1.5 text-label text-ink-muted">{error}</p>}
          </div>
          {recording ? (
            <div className="flex flex-wrap gap-1.5">
              {OUTCOME_CHIPS.map(({ outcome, label }) => (
                <button
                  key={outcome}
                  type="button"
                  onPointerDown={() => h.select()}
                  onClick={() => { setRecording(false); resolve(today, outcome) }}
                  className="min-h-[44px] px-3.5 rounded-xl text-body bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { h.tap(); setRecording(true) }}
              className="self-start min-h-[44px] text-label text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
            >
              Record what came back
            </button>
          )}
        </>
      ) : (
        <p className="text-body leading-relaxed text-ink-muted">
          Today&rsquo;s ask is made and answered. Done for today.
        </p>
      )}
    </div>
  )
}
