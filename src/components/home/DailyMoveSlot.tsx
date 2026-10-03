import React, { useState } from 'react'
import { ArrowUpRight, MessageSquare } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { WhyBadge } from '../shared/WhyBadge'
import { RejectReasonBar } from '../shared/RejectReasonBar'
import { STRATEGIST_SURFACE } from '../../lib/servedSurfaces'
import { useHaptics } from '../../hooks/useHaptics'
import { jobLabel } from '../../content/jobs'
import type { DailyChallenge, NextStepSection } from '../../types/strategist'

// Today's move, proposed in the first slot of Today when that slot is empty
// (ADR-028, overturning ADR-018's manual-first Today by Krish's ruling of
// 2026-10-03). The machine proposes and he reacts: one tap takes it into the
// slot, one tap sets it aside and shows the next, one tap leaves it for today.
//
// It is a proposal until he takes it, and looks like one: a dashed ring where
// his own slots have a solid one, and a label that says who suggested it.
// Nothing here writes his Today list; TodayList's own slot write does, on Take.

const BTN = 'tap-44 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-3 text-label transition-colors'
const BTN_PRIMARY = `${BTN} border-violet-400/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30`
const BTN_QUIET = `${BTN} border-white/10 text-ink-muted hover:bg-white/[0.05] hover:text-ink`
const BTN_TEXT = 'tap-44 inline-flex min-h-[32px] items-center px-2 text-label text-ink-faint hover:text-ink-muted'

export function DailyMoveSlot({
  move, challenge, hasAsk, compact, onTake, onNotThis, onLater, onOpenAsk,
}: {
  move: NextStepSection
  challenge: DailyChallenge | null | undefined
  /** The read drafted an ask to this move's person: offer to open it. */
  hasAsk: boolean
  compact: boolean
  onTake: () => void
  /** The reason he picked, and what he typed under "Say more", kept whole. */
  onNotThis: (reasonCode: string, note: string | null) => void
  onLater: () => void
  onOpenAsk: () => void
}) {
  const h = useHaptics()
  const [rejecting, setRejecting] = useState(false)
  const [showSurvived, setShowSurvived] = useState(false)
  const person = move.person
  const who = person
    ? [person.name, person.title && person.company ? `${person.title} at ${person.company}` : (person.title || person.company || '')]
        .filter(Boolean).join(', ')
    : null

  const survived = challenge && challenge.verdict !== 'unchallenged' && challenge.objection ? (
    <div className="flex flex-col gap-0.5" data-testid="daily-move-survived">
      <p className="text-micro leading-relaxed text-ink-faint break-words">
        {challenge.by || 'A second strategist'} argued against it: {challenge.objection}
      </p>
      {challenge.why && (
        <p className="text-micro leading-relaxed text-ink-faint break-words">
          {challenge.verdict === 'switched' ? 'Why it moved up: ' : 'Why it stayed first: '}{challenge.why}
        </p>
      )}
    </div>
  ) : null

  return (
    <li className="flex items-start gap-3" data-testid="daily-move-slot">
      {/* Dashed where his own slots are solid: not his until he takes it. */}
      <span
        aria-hidden
        className={`mt-[1px] ${compact ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'} rounded-full border border-dashed border-violet-400/50 flex-shrink-0 inline-flex items-center justify-center`}
      >
        <span className="text-micro font-bold tabular-nums font-mono text-violet-200/80">1</span>
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <Eyebrow tone="accent">Suggested for today</Eyebrow>
        <p className="text-body leading-snug text-ink break-words" data-testid="daily-move-text">{move.text}</p>
        {who && <p className="text-label leading-snug text-ink-muted break-words" data-testid="daily-move-person">{who}</p>}
        {move.why && <p className="text-label leading-relaxed text-ink-muted break-words">{move.why}</p>}

        {/* What it survived: in full on the desk, one tap away on a phone,
            where Home has no height to spare and the move comes first. */}
        {survived && (compact ? (
          showSurvived ? survived : (
            <button
              type="button"
              onClick={() => { h.tap(); setShowSurvived(true) }}
              className="tap-44 self-start inline-flex min-h-[28px] items-center text-micro text-ink-faint hover:text-ink-muted"
              data-testid="daily-move-show-survived"
            >
              What it survived
            </button>
          )
        ) : survived)}

        {/* Two groups that wrap as units: taking it, and not now. On a phone
            the second drops to its own line whole, never one control alone. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
          <div className="flex items-center gap-1.5">
            <button type="button" className={BTN_PRIMARY} data-testid="daily-move-take" onClick={() => { h.success(); onTake() }}>
              Take it
            </button>
            {move.draft_url ? (
              <a
                href={move.draft_url}
                target="_blank"
                rel="noopener noreferrer"
                className={BTN_QUIET}
                data-testid="daily-move-open-draft"
                onClick={() => h.tap()}
              >
                <ArrowUpRight size={12} /> Open draft
              </a>
            ) : hasAsk ? (
              <button type="button" className={BTN_QUIET} data-testid="daily-move-open-ask" onClick={() => { h.tap(); onOpenAsk() }}>
                <MessageSquare size={12} /> Open the ask
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={BTN_TEXT}
              data-testid="daily-move-not-this"
              aria-expanded={rejecting}
              onClick={() => { h.tap(); setRejecting(r => !r) }}
            >
              Not this
            </button>
            <button type="button" className={BTN_TEXT} data-testid="daily-move-later" onClick={() => { h.select(); onLater() }}>
              Later
            </button>
            <WhyBadge
              why={STRATEGIST_SURFACE.why({ why: move.why ?? null, job_label: move.job ? jobLabel(move.job) : null })}
              label={STRATEGIST_SURFACE.label}
            />
          </div>
        </div>

        {rejecting && (
          <RejectReasonBar
            title="Why not this one?"
            reasons={STRATEGIST_SURFACE.reasons}
            onChoose={(code, note) => { h.select(); setRejecting(false); onNotThis(code ?? STRATEGIST_SURFACE.defaultReason, note ?? null) }}
            onCancel={() => setRejecting(false)}
            cancelLabel="Keep it"
            className="mt-1"
          />
        )}
      </div>
    </li>
  )
}
