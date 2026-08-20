import React, { useEffect, useRef, useState } from 'react'
import { useHaptics } from '../../hooks/useHaptics'
import { civilYmd } from '../../lib/civilDate'
import { AskCard } from './AskCard'
import { WorryCompiler } from '../pilot/WorryCompiler'
import { ShutdownModal } from '../pilot/EveningShutdown'
import { VoiceField } from '../pilot/controls'
import {
  purposeFor, TRAPS, SITUATIONS, DECISION_RULES, rulesVerdict,
  type Trap, type Situation,
} from '../../content/focusTheory'

/**
 * Focus & Purpose: the home for the operator himself, not the fleet.
 *
 * It exists to counter one specific pattern, diagnosed in
 * docs/focus-purpose/OPERATING-MANUAL.md: strengths (fast inference, precision,
 * completeness) turning into traps in relationship-sensitive moments, and
 * exposure being replaced with productive-looking preparation. The theory
 * lives in src/content/focusTheory.ts and surfaces here only at the point of
 * action, one slice at a time.
 *
 * The pilot layer's non-negotiables extend to this whole surface: no archive,
 * no streaks, no scores, no charts, nothing that watches him back. Every
 * section ends in one move. The spine is the daily ask (AskCard); everything
 * else is a quiet row that opens one at a time and closes behind him.
 *
 * Arriving with ?steady=1 (the anxious-morning auto-route from PilotGate)
 * opens Steady first: name what is running, take the counter-move, go.
 */

type Section = 'steady' | 'speak' | 'idea' | null

interface Props {
  variant: 'desktop' | 'mobile'
  /** True when the anxious-morning route brought him here. */
  steadyEntry?: boolean
}

export function FocusPurposeTab({ variant, steadyEntry }: Props) {
  const h = useHaptics()
  const [open, setOpen] = useState<Section>(steadyEntry ? 'steady' : null)
  const [worryOpen, setWorryOpen] = useState(false)
  const [shutdownOpen, setShutdownOpen] = useState(false)
  // Bumped when a trap's counter-move is the ask; AskCard focuses compose.
  const [composeSignal, setComposeSignal] = useState(0)
  const askRef = useRef<HTMLDivElement>(null)

  const purpose = purposeFor(civilYmd())
  const compact = variant === 'mobile'

  const toggle = (s: Exclude<Section, null>) => {
    h.tap()
    setOpen(prev => (prev === s ? null : s))
  }

  const toAsk = () => {
    h.impactMedium()
    setOpen(null)
    setComposeSignal(n => n + 1)
    askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`w-full ${compact ? '' : 'max-w-[620px] mx-auto'} flex flex-col gap-4 pb-6`}>

      {/* The purpose anchor: one line of his own record, per day. Never more. */}
      <header className={compact ? 'pt-1' : 'pt-2'}>
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">Focus &amp; Purpose</span>
        <p className="mt-2.5 font-serif text-[19px] leading-[1.4] text-ink">{purpose.line}</p>
        <p className="mt-1.5 text-[11px] tracking-wide text-ink-faint">{purpose.source}</p>
      </header>

      {/* The spine: one clean ask a day. */}
      <div ref={askRef} className="scroll-mt-4">
        <AskCard variant={variant} composeSignal={composeSignal} />
      </div>

      <SteadySection
        open={open === 'steady'}
        onToggle={() => toggle('steady')}
        onAsk={toAsk}
        onCompile={() => { setOpen(null); setWorryOpen(true) }}
        compact={compact}
      />

      <SpeakSection open={open === 'speak'} onToggle={() => toggle('speak')} compact={compact} />

      <IdeaSection open={open === 'idea'} onToggle={() => toggle('idea')} compact={compact} />

      {/* The two day-boundary actions, homed here instead of floating over
          every tab. The after-5pm shutdown prompt still fires on its own. */}
      <div className="flex items-center gap-5 pt-1 pl-1">
        <button
          type="button"
          onClick={() => { h.tap(); setWorryOpen(true) }}
          className="min-h-[44px] text-[13px] text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
        >
          compile a worry
        </button>
        <span aria-hidden className="w-px h-4 bg-white/[0.10]" />
        <button
          type="button"
          onClick={() => { h.tap(); setShutdownOpen(true) }}
          className="min-h-[44px] text-[13px] text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
        >
          shutdown
        </button>
      </div>

      <WorryCompiler open={worryOpen} onClose={() => setWorryOpen(false)} />
      {shutdownOpen && <ShutdownModal onClose={() => setShutdownOpen(false)} onSaved={() => setShutdownOpen(false)} />}
    </div>
  )
}

// ── Section chrome: a quiet row that opens one at a time ─────────────────────

function SectionCard({
  title, sub, open, onToggle, compact, children,
}: {
  title: string
  sub: string
  open: boolean
  onToggle: () => void
  compact: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] ${compact ? 'p-4' : 'p-5'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center justify-between gap-4 text-left touch-manipulation"
      >
        <span>
          <span className="block text-[14px] text-ink">{title}</span>
          <span className="block mt-0.5 text-[12px] text-ink-faint">{sub}</span>
        </span>
        <span aria-hidden className="text-[16px] leading-none text-ink-faint">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-4 animate-[pilotIn_260ms_ease-out]">{children}</div>}
    </section>
  )
}

/** Shared chip styling for the three sections. */
const CHIP = (selected: boolean) =>
  `min-h-[48px] px-3 rounded-2xl text-[13.5px] text-left leading-snug border transition-all active:scale-[0.97] touch-manipulation ${
    selected
      ? 'bg-ink/[0.10] border-ink/25 text-ink'
      : 'bg-ink/[0.02] border-ink/[0.08] text-ink-muted hover:bg-ink/[0.05]'
  }`

// ── Steady: name what is running, take the counter-move ──────────────────────

function SteadySection({
  open, onToggle, onAsk, onCompile, compact,
}: {
  open: boolean
  onToggle: () => void
  onAsk: () => void
  onCompile: () => void
  compact: boolean
}) {
  const h = useHaptics()
  const [trap, setTrap] = useState<Trap | null>(null)

  return (
    <SectionCard
      title="Steady"
      sub="Name what is running. The counter-move is one line."
      open={open}
      onToggle={onToggle}
      compact={compact}
    >
      <div className="grid grid-cols-2 gap-2">
        {TRAPS.map(t => (
          <button
            key={t.id}
            type="button"
            onPointerDown={() => h.select()}
            onClick={() => setTrap(trap?.id === t.id ? null : t)}
            className={CHIP(trap?.id === t.id)}
          >
            {t.chip}
          </button>
        ))}
      </div>

      {/* The verdict sits under the chips, where the tap happened. */}
      {trap && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[14px] leading-relaxed text-ink">{trap.move}</p>
          <p className="text-[12px] leading-relaxed text-ink-faint">{trap.ifThen}</p>
          {trap.handoff === 'ask' && (
            <button
              type="button"
              onClick={onAsk}
              className="self-start min-h-[48px] px-4 rounded-xl text-[14px] font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] active:scale-[0.97] transition-all touch-manipulation"
            >
              Write the ask
            </button>
          )}
          {trap.handoff === 'compile' && (
            <button
              type="button"
              onClick={onCompile}
              className="self-start min-h-[48px] px-4 rounded-xl text-[14px] font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] active:scale-[0.97] transition-all touch-manipulation"
            >
              Compile it
            </button>
          )}
        </div>
      )}
    </SectionCard>
  )
}

// ── Before you speak: the script for the moment ──────────────────────────────

function SpeakSection({ open, onToggle, compact }: { open: boolean; onToggle: () => void; compact: boolean }) {
  const h = useHaptics()
  const [sit, setSit] = useState<Situation | null>(null)

  return (
    <SectionCard
      title="Before you speak"
      sub="The sequence for the conversation in front of you."
      open={open}
      onToggle={onToggle}
      compact={compact}
    >
      <div className="grid grid-cols-2 gap-2">
        {SITUATIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onPointerDown={() => h.select()}
            onClick={() => setSit(sit?.id === s.id ? null : s)}
            className={CHIP(sit?.id === s.id)}
          >
            {s.chip}
          </button>
        ))}
      </div>

      {sit && (
        <div className="mt-4 flex flex-col gap-3">
          <ol className="flex flex-col gap-2">
            {sit.sequence.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink">
                <span className="text-ink-faint shrink-0 font-mono text-[12px] pt-[3px]">{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <p className="text-[12px] leading-relaxed text-ink-faint">Not: &ldquo;{sit.not}&rdquo;</p>
          <p className="text-[12px] leading-relaxed text-ink-muted">{sit.stop}</p>
        </div>
      )}
    </SectionCard>
  )
}

// ── Test an idea: the seven rules, before it eats a week ─────────────────────

function IdeaSection({ open, onToggle, compact }: { open: boolean; onToggle: () => void; compact: boolean }) {
  const h = useHaptics()
  const [idea, setIdea] = useState('')
  const [tripped, setTripped] = useState<Set<string>>(new Set())
  const [judged, setJudged] = useState(false)

  const flip = (id: string) => {
    h.select()
    setJudged(true)
    setTripped(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const reset = () => {
    h.tap()
    setIdea('')
    setTripped(new Set())
    setJudged(false)
  }

  const trippedRules = DECISION_RULES.filter(r => tripped.has(r.id))

  return (
    <SectionCard
      title="Test an idea"
      sub="Against your own rules, before it eats a week."
      open={open}
      onToggle={onToggle}
      compact={compact}
    >
      <div className="flex flex-col gap-3">
        <VoiceField value={idea} onChange={setIdea} rows={2} placeholder="The idea, in one sentence. Optional." />
        <p className="-mt-1 text-[11px] text-ink-faint">Nothing here is saved. This is a gut check, not a record.</p>

        <div className="grid grid-cols-1 gap-2">
          {DECISION_RULES.map(r => (
            <button
              key={r.id}
              type="button"
              onPointerDown={() => h.select()}
              onClick={() => flip(r.id)}
              className={CHIP(tripped.has(r.id))}
            >
              {r.chip}
            </button>
          ))}
        </div>

        {!judged && (
          <button
            type="button"
            onClick={() => { h.impactMedium(); setJudged(true) }}
            className="self-start min-h-[44px] text-[13px] text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
          >
            It trips none of these
          </button>
        )}

        {judged && (
          <div className="flex flex-col gap-2.5 pt-1">
            <p className="text-[14px] leading-relaxed text-ink">{rulesVerdict(tripped.size)}</p>
            {trippedRules.map(r => (
              <p key={r.id} className="text-[12px] leading-relaxed text-ink-faint">{r.verdict}</p>
            ))}
            <button
              type="button"
              onClick={reset}
              className="self-start min-h-[44px] text-[12px] text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
            >
              Clear it
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
