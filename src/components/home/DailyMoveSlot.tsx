import React, { useState } from 'react'
import { ArrowUpRight, MessageSquare } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { WhyBadge } from '../shared/WhyBadge'
import { FoldToggle } from '../shared/FoldToggle'
import { RejectReasonBar } from '../shared/RejectReasonBar'
import { BottomSheet } from '../mobile/BottomSheet'
import { STRATEGIST_SURFACE } from '../../lib/servedSurfaces'
import { useHaptics } from '../../hooks/useHaptics'
import { jobLabel } from '../../content/jobs'
import type { DailyChallenge, NextStepSection, StepOutcome } from '../../types/strategist'

// Today's move, proposed in the first slot of Today when that slot is empty
// (ADR-028, overturning ADR-018's manual-first Today by Krish's ruling of
// 2026-10-03). The machine proposes and he reacts: one tap takes it into the
// slot, one tap sets it aside and shows the next, one tap leaves it for today.
//
// It is a proposal until he takes it, and looks like one: a dashed ring where
// his own slots have a solid one, and a label that says who suggested it.
// Nothing here writes his Today list; TodayList's own slot write does, on Take.
//
// Home never scrolls (src/lib/homeFolds.ts), so the card folds when the screen
// is short, and folds in steps that keep everything one tap away:
//   why      its why goes into the "?"
//   actions  one row of controls, tighter spacing, and the person line is the
//            name alone, which opens the ask or the draft; who they are moves
//            into the "?"
//   card     one line, until he opens it, which happens only when he has
//            opened something else on Home by hand
// What it survived lives in the "?" only, at every size, never inline: it is
// evidence, and evidence is shown when asked (Growth's rule, 2026-10-05). The
// why line is the one plain reason to act and stays on the card. On a phone "Not this" asks why in the house sheet, never inline:
// the reasons are taller than a short screen can lend the card.

const BTN = 'tap-44 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-3 text-label transition-colors'
const BTN_PRIMARY = `${BTN} border-violet-400/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30`
const BTN_QUIET = `${BTN} border-white/10 text-ink-muted hover:bg-white/[0.05] hover:text-ink`
const BTN_TEXT = 'tap-44 inline-flex min-h-[32px] items-center px-2 text-label text-ink-faint hover:text-ink-muted'

export interface MoveFolds {
  why: boolean
  actions: boolean
  card: boolean
}

const NO_FOLDS: MoveFolds = { why: false, actions: false, card: false }

/** What the move survived, in one plain paragraph, or null when nothing challenged it. */
export function survivedLine(challenge: DailyChallenge | null | undefined): string | null {
  if (!challenge || challenge.verdict === 'unchallenged' || !challenge.objection) return null
  const why = challenge.why
    ? ` ${challenge.verdict === 'switched' ? 'Why it moved up' : 'Why it stayed first'}: ${challenge.why}`
    : ''
  return `${challenge.by || 'A second strategist'} argued against it: ${challenge.objection}${why}`
}

export function DailyMoveSlot({
  move, outcome = null, challenge, hasAsk, compact, fold = NO_FOLDS, onShow, onTake, onNotThis, onLater, onOpenAsk,
}: {
  move: NextStepSection
  /** What already happened to this move (ADR-030). `drafted` means the words
   *  exist from a walkthrough and the press is his: the draft leads. */
  outcome?: StepOutcome | null
  challenge: DailyChallenge | null | undefined
  /** The read drafted an ask to this move's person: offer to open it. */
  hasAsk: boolean
  compact: boolean
  fold?: MoveFolds
  /** Open the folded card by hand. */
  onShow?: () => void
  onTake: () => void
  /** The reason he picked, and what he typed under "Add a note", kept whole. */
  onNotThis: (reasonCode: string, note: string | null) => void
  onLater: () => void
  onOpenAsk: () => void
}) {
  const h = useHaptics()
  const [rejecting, setRejecting] = useState(false)
  const person = move.person
  const who = person
    ? [person.name, person.title && person.company ? `${person.title} at ${person.company}` : (person.title || person.company || '')]
        .filter(Boolean).join(', ')
    : null
  const survived = survivedLine(challenge)
  const base = STRATEGIST_SURFACE.why({ why: move.why ?? null, job_label: move.job ? jobLabel(move.job) : null })
  // With the controls folded the person line is the name alone, so who they
  // are moves into the "?" beside the reason, not out of reach.
  const why = {
    ...base,
    factors: fold.actions && who ? [{ label: 'Who', value: who }, ...(base.factors ?? [])] : base.factors,
    footnote: survived,
  }
  const badge = <WhyBadge why={why} label={STRATEGIST_SURFACE.label} />

  // The reasons, inline on the desk, in the house sheet on a phone. Asking
  // why keeps the card open: it is what he is working on.
  const chooseReason = (code: string | undefined, note: string | undefined) => {
    h.select()
    setRejecting(false)
    onNotThis(code ?? STRATEGIST_SURFACE.defaultReason, note ?? null)
  }
  const reasons = (
    <RejectReasonBar
      title="Why not this one?"
      reasons={STRATEGIST_SURFACE.reasons}
      onChoose={chooseReason}
      onCancel={() => setRejecting(false)}
      cancelLabel="Keep it"
      className={compact ? '' : 'mt-1'}
    />
  )
  const reasonSheet = compact ? (
    <BottomSheet open={rejecting} onClose={() => setRejecting(false)} fullHeight={false} ariaLabel="Why not this one?">
      <div className="pb-2">{reasons}</div>
    </BottomSheet>
  ) : null

  const ring = (
    // Dashed where his own slots are solid: not his until he takes it.
    <span
      aria-hidden
      className={`mt-[1px] ${compact ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'} rounded-full border border-dashed border-violet-400/50 flex-shrink-0 inline-flex items-center justify-center`}
    >
      <span className="text-micro font-bold tabular-nums font-mono text-violet-200/80">1</span>
    </span>
  )

  if (fold.card && !rejecting) {
    return (
      <li className="flex items-center gap-3" data-testid="daily-move-slot" data-folded="true">
        {ring}
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <Eyebrow tone="accent">Suggested for today</Eyebrow>
          {onShow && <FoldToggle open={false} onToggle={onShow} what="today's suggested move" testId="daily-move-show" />}
        </div>
        {reasonSheet}
      </li>
    )
  }

  // A move already drafted with him leads with the draft: the words exist and
  // the press is his (ADR-030). Take it stays, quieter, for putting it in the
  // slot without opening anything.
  const drafted = outcome === 'drafted'
  const eyebrow = drafted ? 'Drafted with you. Your press.' : 'Suggested for today'
  const take = (
    <button type="button" className={drafted && move.draft_url ? BTN_QUIET : BTN_PRIMARY} data-testid="daily-move-take" onClick={() => { h.success(); onTake() }}>
      Take it
    </button>
  )
  const notThis = (
    <button
      type="button"
      className={BTN_TEXT}
      data-testid="daily-move-not-this"
      aria-expanded={rejecting}
      onClick={() => { h.tap(); setRejecting(r => !r) }}
    >
      Not this
    </button>
  )
  const later = (
    <button type="button" className={BTN_TEXT} data-testid="daily-move-later" onClick={() => { h.select(); onLater() }}>
      Later
    </button>
  )
  const open = move.draft_url ? (
    <a
      href={move.draft_url}
      target="_blank"
      rel="noopener noreferrer"
      className={drafted ? BTN_PRIMARY : BTN_QUIET}
      data-testid="daily-move-open-draft"
      onClick={() => h.tap()}
    >
      <ArrowUpRight size={12} /> {drafted ? 'Open the draft' : 'Open draft'}
    </a>
  ) : hasAsk ? (
    <button type="button" className={BTN_QUIET} data-testid="daily-move-open-ask" onClick={() => { h.tap(); onOpenAsk() }}>
      <MessageSquare size={12} /> Open the ask
    </button>
  ) : null

  // With the controls folded to one row, the person line is where the ask or
  // the draft opens from: it is the person the ask is to.
  const shownWho = fold.actions && person ? person.name : who
  const personLine = !who ? null : fold.actions && move.draft_url ? (
    <a
      href={move.draft_url}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 self-start inline-flex items-baseline gap-1 text-left text-label leading-snug text-ink-muted underline decoration-white/20 underline-offset-2 hover:text-ink break-words"
      data-testid="daily-move-person"
      onClick={() => h.tap()}
    >
      <span>{shownWho}</span><ArrowUpRight size={10} className="flex-shrink-0 self-center" />
    </a>
  ) : fold.actions && hasAsk ? (
    <button
      type="button"
      className="tap-44 self-start inline-flex items-baseline gap-1 text-left text-label leading-snug text-ink-muted underline decoration-white/20 underline-offset-2 hover:text-ink break-words"
      data-testid="daily-move-person"
      onClick={() => { h.tap(); onOpenAsk() }}
    >
      <span>{shownWho}</span><MessageSquare size={10} className="flex-shrink-0 self-center" />
    </button>
  ) : (
    <p className="text-label leading-snug text-ink-muted break-words" data-testid="daily-move-person">{shownWho}</p>
  )

  return (
    <li className="flex items-start gap-3" data-testid="daily-move-slot" data-folded="false">
      {ring}
      <div className={`flex-1 min-w-0 flex flex-col ${fold.actions ? 'gap-0.5' : 'gap-1'}`}>
        <Eyebrow tone="accent">{eyebrow}</Eyebrow>
        <p className="text-body leading-snug text-ink break-words" data-testid="daily-move-text">{move.text}</p>
        {personLine}
        {!fold.why && move.why && <p className="text-label leading-relaxed text-ink-muted break-words" data-testid="daily-move-why">{move.why}</p>}

        {fold.actions ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {take}{notThis}{later}{badge}
          </div>
        ) : (
          // Two groups that wrap as units: taking it, and not now. On a phone
          // the second drops to its own line whole, never one control alone.
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
            <div className="flex items-center gap-1.5">{drafted && move.draft_url ? <>{open}{take}</> : <>{take}{open}</>}</div>
            <div className="flex items-center gap-1.5">{notThis}{later}{badge}</div>
          </div>
        )}

        {rejecting && !compact && reasons}
      </div>
      {reasonSheet}
    </li>
  )
}
