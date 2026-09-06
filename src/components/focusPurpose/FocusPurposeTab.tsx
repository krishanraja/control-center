import React, { useRef, useState } from 'react'
import { ChevronRight, Minus, Plus, X } from '@/lib/icons'
import { useHaptics } from '../../hooks/useHaptics'
import { civilYmd } from '../../lib/civilDate'
import { AskCard } from './AskCard'
import { WorryCompiler } from '../pilot/WorryCompiler'
import { ShutdownModal } from '../pilot/EveningShutdown'
import { VoiceField } from '../pilot/controls'
import { BottomSheet } from '../mobile/BottomSheet'
import { Eyebrow } from '../shared/Eyebrow'
import { useQuickCreateListener } from '../../lib/quickCreate'
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
 * section ends in one move. The spine is the daily ask (AskCard); the three
 * tools are quiet one-line rows. On a phone a row opens a bottom sheet (one
 * tool owns the screen at a time, and the whole tab fits without scrolling);
 * on the desk it expands in place.
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

const TOOLS: Array<{ id: Exclude<Section, null>; title: string; sub: string }> = [
  { id: 'steady', title: 'Steady yourself', sub: 'Spot the pattern, get the counter-move.' },
  { id: 'speak', title: 'Before you speak', sub: 'Scripts for hard conversations.' },
  { id: 'idea', title: 'Test an idea', sub: 'Check it against your rules. Nothing is saved.' },
]

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

  // The + create sheet's "Write today's ask" lands here.
  useQuickCreateListener('ask', toAsk)

  const toCompile = () => {
    setOpen(null)
    setWorryOpen(true)
  }

  const body = (s: Exclude<Section, null>) => {
    switch (s) {
      case 'steady': return <SteadyBody onAsk={toAsk} onCompile={toCompile} />
      case 'speak': return <SpeakBody />
      case 'idea': return <IdeaBody />
    }
  }

  return (
    <div className={`w-full ${compact ? 'gap-3 [@media(max-height:860px)]:gap-2' : 'max-w-[620px] mx-auto gap-4'} flex flex-col pb-6`}>

      {/* The purpose anchor: one line of his own record, per day. Never more. */}
      <header className={compact ? 'pt-0' : 'pt-2'}>
        <Eyebrow>Focus &amp; Purpose</Eyebrow>
        {/* Never clamped: the line is the point. Short phone viewports step the
            line down a type rung and tighten rhythm (the same height-gated
            compression Home uses) so the whole tab still fits; only genuinely
            tiny screens fall back to the wrapper's scroll. Never "…". */}
        <p className={`mt-2 font-serif leading-[1.4] text-ink ${compact ? 'text-title [@media(max-height:860px)]:text-lede' : 'text-title'}`}>{purpose.line}</p>
        <p className="mt-1 text-micro tracking-wide text-ink-faint">{purpose.source}</p>
      </header>

      {/* The spine: one clean ask a day. */}
      <div ref={askRef} className="scroll-mt-4">
        <AskCard variant={variant} composeSignal={composeSignal} />
      </div>

      {/* The three tools. On a phone: one-line rows into a bottom sheet, so
          the tab reads at a glance and fits one screen. On the desk: the same
          rows expand in place. */}
      {compact ? (
        <>
          <div className="flex flex-col gap-2">
            {TOOLS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className="group flex w-full items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 [@media(max-height:860px)]:py-2 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.99] touch-manipulation"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-ui leading-tight text-ink">{t.title}</span>
                  <span className="mt-0.5 block text-label leading-tight text-ink-faint">{t.sub}</span>
                </span>
                <ChevronRight size={15} className="flex-shrink-0 text-ink-faint" aria-hidden />
              </button>
            ))}
          </div>

          <BottomSheet
            open={open !== null}
            onClose={() => setOpen(null)}
            fullHeight={false}
            ariaLabel={open ? TOOLS.find(t => t.id === open)?.title : undefined}
          >
            {open && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-5 pb-1">
                  <div>
                    <p className="text-ui font-semibold text-ink">{TOOLS.find(t => t.id === open)!.title}</p>
                    <p className="mt-0.5 text-label text-ink-faint">{TOOLS.find(t => t.id === open)!.sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    aria-label="Close"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-ink-faint active:bg-white/[0.08]"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="max-h-[calc(66dvh/var(--z,1))] overflow-y-auto px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
                  {body(open)}
                </div>
              </div>
            )}
          </BottomSheet>
        </>
      ) : (
        TOOLS.map(t => (
          <SectionCard
            key={t.id}
            title={t.title}
            sub={t.sub}
            open={open === t.id}
            onToggle={() => toggle(t.id)}
          >
            {body(t.id)}
          </SectionCard>
        ))
      )}

      {/* The two day-boundary actions, homed here instead of floating over
          every tab. The after-5pm shutdown prompt still fires on its own. */}
      <div className="flex items-center gap-5 pt-0.5 pl-1">
        <button
          type="button"
          onClick={() => { h.tap(); setWorryOpen(true) }}
          className="min-h-[44px] text-body text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
        >
          compile a worry
        </button>
        <span aria-hidden className="w-px h-4 bg-white/[0.10]" />
        <button
          type="button"
          onClick={() => { h.tap(); setShutdownOpen(true) }}
          className="min-h-[44px] text-body text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
        >
          shutdown
        </button>
      </div>

      <WorryCompiler open={worryOpen} onClose={() => setWorryOpen(false)} />
      {shutdownOpen && <ShutdownModal onClose={() => setShutdownOpen(false)} onSaved={() => setShutdownOpen(false)} />}
    </div>
  )
}

// ── Desktop section chrome: a quiet row that opens in place ──────────────────

function SectionCard({
  title, sub, open, onToggle, children,
}: {
  title: string
  sub: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center justify-between gap-4 text-left touch-manipulation"
      >
        <span>
          <span className="block text-ui text-ink">{title}</span>
          <span className="block mt-0.5 text-label text-ink-faint">{sub}</span>
        </span>
        <span aria-hidden className="text-ink-faint">{open ? <Minus size={16} /> : <Plus size={16} />}</span>
      </button>
      {open && <div className="mt-4 animate-[pilotIn_260ms_ease-out]">{children}</div>}
    </section>
  )
}

/** Shared chip styling for the three tools. */
const CHIP = (selected: boolean) =>
  `min-h-[48px] px-3 rounded-2xl text-body text-left leading-snug border transition-all active:scale-[0.97] touch-manipulation ${
    selected
      ? 'bg-ink/[0.10] border-ink/25 text-ink'
      : 'bg-ink/[0.02] border-ink/[0.08] text-ink-muted hover:bg-ink/[0.05]'
  }`

// ── Steady: name what is running, take the counter-move ──────────────────────

function SteadyBody({ onAsk, onCompile }: { onAsk: () => void; onCompile: () => void }) {
  const h = useHaptics()
  const [trap, setTrap] = useState<Trap | null>(null)

  return (
    <div>
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
          <p className="text-ui leading-relaxed text-ink">{trap.move}</p>
          <p className="text-label leading-relaxed text-ink-faint">{trap.ifThen}</p>
          {trap.handoff === 'ask' && (
            <button
              type="button"
              onClick={onAsk}
              className="self-start min-h-[48px] px-4 rounded-xl text-ui font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] active:scale-[0.97] transition-all touch-manipulation"
            >
              Write the ask
            </button>
          )}
          {trap.handoff === 'compile' && (
            <button
              type="button"
              onClick={onCompile}
              className="self-start min-h-[48px] px-4 rounded-xl text-ui font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] active:scale-[0.97] transition-all touch-manipulation"
            >
              Compile it
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Before you speak: the script for the moment ──────────────────────────────

function SpeakBody() {
  const h = useHaptics()
  const [sit, setSit] = useState<Situation | null>(null)

  return (
    <div>
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
              <li key={i} className="flex gap-2.5 text-ui leading-relaxed text-ink">
                <span className="text-ink-faint shrink-0 font-mono text-label pt-[3px]">{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <p className="text-label leading-relaxed text-ink-faint">Not: &ldquo;{sit.not}&rdquo;</p>
          <p className="text-label leading-relaxed text-ink-muted">{sit.stop}</p>
        </div>
      )}
    </div>
  )
}

// ── Test an idea: the eight rules v2, before it eats a week ─────────────────────

function IdeaBody() {
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
    <div className="flex flex-col gap-3">
      <VoiceField value={idea} onChange={setIdea} rows={2} placeholder="The idea, in one sentence. Optional." />
      <p className="-mt-1 text-micro text-ink-faint">Nothing here is saved. This is a gut check, not a record.</p>

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
          className="self-start min-h-[44px] text-body text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
        >
          It trips none of these
        </button>
      )}

      {judged && (
        <div className="flex flex-col gap-2.5 pt-1">
          <p className="text-ui leading-relaxed text-ink">{rulesVerdict(tripped.size)}</p>
          {trippedRules.map(r => (
            <p key={r.id} className="text-label leading-relaxed text-ink-faint">{r.verdict}</p>
          ))}
          <button
            type="button"
            onClick={reset}
            className="self-start min-h-[44px] text-label text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
          >
            Clear it
          </button>
        </div>
      )}
    </div>
  )
}
