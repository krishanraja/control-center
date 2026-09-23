import React, { useRef, useState } from 'react'
import { Brain, ChevronDown, ChevronRight, Moon, X } from '@/lib/icons'
import { useMediaQuery } from '../shared/motion'
import { useHaptics } from '../../hooks/useHaptics'
import { civilYmd } from '../../lib/civilDate'
import { AskCard } from './AskCard'
import { WorryCompiler } from '../pilot/WorryCompiler'
import { ShutdownModal } from '../pilot/EveningShutdown'
import { VoiceField } from '../pilot/controls'
import { BottomSheet } from '../mobile/BottomSheet'
import { Eyebrow } from '../shared/Eyebrow'
import { Claim } from '../shared/Claim'
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
  // A SET, not one value. Stacked, only one tool can sensibly be open at a
  // time and the phone's bottom sheet can only show one anyway. Side by side
  // on a wide desk that restriction is just wrong: closing "Steady yourself"
  // to read "Before you speak" throws away the column you were using. So the
  // desk toggles membership and the phone keeps the single-open accordion.
  const [open, setOpen] = useState<Set<string>>(() => new Set(steadyEntry ? ['steady'] : []))
  const [worryOpen, setWorryOpen] = useState(false)
  const [shutdownOpen, setShutdownOpen] = useState(false)
  // Bumped when a trap's counter-move is the ask; AskCard focuses compose.
  const [composeSignal, setComposeSignal] = useState(0)
  const askRef = useRef<HTMLDivElement>(null)

  const purpose = purposeFor(civilYmd())
  const compact = variant === 'mobile'
  // Above 1400px the three tools sit side by side instead of stacked. Measured
  // 2026-09-17: at 1920 this tab was a 620px ribbon with 1060px of dead width
  // beside it, the widest waste of any surface in the app.
  const wideDesk = useMediaQuery('(min-width: 1400px)') && !compact

  const toggle = (s: Exclude<Section, null>) => {
    h.tap()
    setOpen(prev => {
      if (prev.has(s)) { const next = new Set(prev); next.delete(s); return next }
      return wideDesk ? new Set(prev).add(s) : new Set([s])
    })
  }

  const toAsk = () => {
    h.impactMedium()
    setOpen(new Set())
    setComposeSignal(n => n + 1)
    askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // The + create sheet's "Write today's ask" lands here.
  useQuickCreateListener('ask', toAsk)

  const toCompile = () => {
    setOpen(new Set())
    setWorryOpen(true)
  }

  /** The one tool the phone's sheet is showing, if any. */
  const sheet = (([...open][0] as Exclude<Section, null> | undefined) ?? null)

  const body = (s: Exclude<Section, null>) => {
    switch (s) {
      case 'steady': return <SteadyBody onAsk={toAsk} onCompile={toCompile} compact={compact} />
      case 'speak': return <SpeakBody compact={compact} />
      case 'idea': return <IdeaBody compact={compact} />
    }
  }

  return (
    // Three widths, one page. Phone: full-bleed, stacked. Desk under 1400px:
    // the 620px reading column it has always been. Desk above it: the spine
    // KEEPS that 620px — a purpose line and one ask are reading, and stretching
    // them would make the tab worse — and the three tools spread into columns
    // beneath, which is what the extra 1060px is actually good for.
    <div className={`w-full flex flex-col pb-6 ${
      compact ? 'gap-3 [@media(max-height:860px)]:gap-2'
      : wideDesk ? 'max-w-[1240px] mx-auto gap-5'
      : 'max-w-[620px] mx-auto gap-4'}`}>

      {/* The purpose anchor: one line of his own record, per day. Never more. */}
      <header className={`${compact ? 'pt-0' : 'pt-2'} ${wideDesk ? 'w-full max-w-[620px]' : ''}`}>
        <Eyebrow>Focus &amp; Purpose</Eyebrow>
        {/* The house claim recipe, now a primitive. Never clamped: the line is
            the point. Short phone viewports step it down a type rung rather
            than cut it, so the whole tab still fits; only genuinely tiny
            screens fall back to the wrapper's scroll. Never "…". */}
        <Claim source={purpose.source} compact={compact} className="mt-2">{purpose.line}</Claim>
      </header>

      {/* The spine: one clean ask a day.

          Above 1400px the ask keeps its 620px measure and the two day-boundary
          rituals move up beside it instead of sitting at the foot of the page
          as two lowercase links. The measure does not grow; the width buys a
          second thing to look at, which is the rule the desk rail follows
          everywhere else. The band used to end at 883px with 600px of bare
          desk to its right. */}
      <div className={wideDesk ? 'flex items-stretch gap-5' : ''}>
        <div ref={askRef} className={`scroll-mt-4 ${wideDesk ? 'w-full max-w-[620px]' : ''}`}>
          <AskCard variant={variant} composeSignal={composeSignal} />
        </div>
        {wideDesk && (
          <DayBoundary onCompile={() => { h.tap(); setWorryOpen(true) }} onShutdown={() => { h.tap(); setShutdownOpen(true) }} />
        )}
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
                className="group surface flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 [@media(max-height:860px)]:py-2 text-left transition-transform active:scale-[0.99] touch-manipulation"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-ui font-medium leading-tight text-ink">{t.title}</span>
                  <span className="mt-0.5 block text-label leading-tight text-ink-faint">{t.sub}</span>
                </span>
                <ChevronRight size={15} className="flex-shrink-0 text-ink-faint" aria-hidden />
              </button>
            ))}
          </div>

          {/* The phone never opens two, so the sheet reads the set's one member. */}
          <BottomSheet
            open={sheet !== null}
            onClose={() => setOpen(new Set())}
            fullHeight={false}
            ariaLabel={sheet ? TOOLS.find(t => t.id === sheet)?.title : undefined}
          >
            {sheet && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-5 pb-1">
                  <div>
                    <p className="text-ui font-semibold text-ink">{TOOLS.find(t => t.id === sheet)!.title}</p>
                    <p className="mt-0.5 text-label text-ink-faint">{TOOLS.find(t => t.id === sheet)!.sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(new Set())}
                    aria-label="Close"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-ink-faint active:bg-white/[0.08]"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="max-h-[calc(66dvh/var(--z,1))] overflow-y-auto px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
                  {body(sheet)}
                </div>
              </div>
            )}
          </BottomSheet>
        </>
      ) : (
        // `items-start` matters: without it the grid stretches all three cards
        // to the tallest, so opening one inflates two empty neighbours.
        <div className={wideDesk ? 'grid grid-cols-3 gap-5 items-start' : 'flex flex-col gap-4'}>
          {TOOLS.map(t => (
            <SectionCard
              key={t.id}
              title={t.title}
              sub={t.sub}
              open={open.has(t.id)}
              onToggle={() => toggle(t.id)}
            >
              {body(t.id)}
            </SectionCard>
          ))}
        </div>
      )}

      {/* The two day-boundary actions, homed here instead of floating over
          every tab. The after-5pm shutdown prompt still fires on its own.
          Above 1400px they have already been rendered beside the ask. */}
      {!wideDesk && (
        // On a phone the pair must clear the mint + button parked bottom-right
        // over this row. Measured at 390 wide: without their icons they end at
        // 284px, and the button's left edge is 318px. Reserving a 72px gutter
        // for it instead wrapped "Shutdown" onto a second line, which on a tab
        // that is meant to fit one screen is the worse of the two problems.
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <BoundaryButton icon={compact ? null : <Brain size={14} />} onClick={() => { h.tap(); setWorryOpen(true) }}>
            Compile a worry
          </BoundaryButton>
          <BoundaryButton icon={compact ? null : <Moon size={14} />} onClick={() => { h.tap(); setShutdownOpen(true) }}>
            Shutdown
          </BoundaryButton>
        </div>
      )}

      <WorryCompiler open={worryOpen} onClose={() => setWorryOpen(false)} />
      {shutdownOpen && <ShutdownModal onClose={() => setShutdownOpen(false)} onSaved={() => setShutdownOpen(false)} />}
    </div>
  )
}

// ── The two day-boundary rituals ─────────────────────────────────────────────

/**
 * They used to be two lowercase text labels with a hairline between them at the
 * foot of the page, which read as debug affordances rather than as the ritual
 * that closes the operator's day. Same two actions, given an edge and a name:
 * sentence case, a bordered pill, and an icon everywhere the width is there for
 * one. Nothing about what they do changed.
 */
function BoundaryButton({
  icon, onClick, children,
}: { icon: React.ReactNode | null; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[40px] items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 text-body text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-ink active:scale-[0.98] touch-manipulation"
    >
      {icon && <span aria-hidden className="text-ink-faint">{icon}</span>}
      {children}
    </button>
  )
}

/** The wide-desk panel beside the ask: the same two rituals as readable rows. */
function DayBoundary({ onCompile, onShutdown }: { onCompile: () => void; onShutdown: () => void }) {
  const rows = [
    { icon: <Brain size={15} />, label: 'Compile a worry', sub: 'Put the loop on paper and close it.', onClick: onCompile },
    { icon: <Moon size={15} />, label: 'Shutdown', sub: 'Say what today was, then stop.', onClick: onShutdown },
  ]
  return (
    <aside className="surface flex min-w-0 flex-1 flex-col rounded-2xl p-5">
      <Eyebrow>Ending the day</Eyebrow>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map(r => (
          <button
            key={r.label}
            type="button"
            onClick={r.onClick}
            className="group flex items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.06] active:scale-[0.99] touch-manipulation"
          >
            <span aria-hidden className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.04] text-ink-faint transition-colors group-hover:text-ink-muted">
              {r.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-body text-ink">{r.label}</span>
              <span className="mt-0.5 block text-label leading-tight text-ink-faint">{r.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
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
    <section className="surface rounded-2xl p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group w-full min-h-[44px] flex items-center justify-between gap-4 text-left touch-manipulation"
      >
        <span>
          <span className="block text-ui font-medium text-ink">{title}</span>
          <span className="block mt-0.5 text-label text-ink-faint">{sub}</span>
        </span>
        {/* A disclosure needs a target and a direction. It used to be a bare
            16px + / − glyph with no hitbox, floating in the corner: the one
            piece of chrome on the surface, and the one that read as unfinished.
            A chevron in a tile rotates to say which way the card is going. */}
        <span
          aria-hidden
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.04] text-ink-faint transition-all duration-200 group-hover:text-ink-muted ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDown size={14} />
        </span>
      </button>
      {open && (
        <div className="mt-4 border-t border-white/[0.07] pt-4 animate-[pilotIn_260ms_ease-out]">{children}</div>
      )}
    </section>
  )
}

/**
 * Shared chip styling for the three tools.
 *
 * Two things it holds. First, density is per device: 48px is the phone's touch
 * floor and the right size in a bottom sheet, and it was also being applied to
 * a mouse on the desk, where three columns of 56px-tall chips for a three-word
 * label pushed "Test an idea" off the bottom of the screen. The desk gets 36px.
 * Second, a selected chip takes the mint accent rather than a grey wash: mint
 * means the active path, and this is the one live answer on the surface.
 */
const CHIP = (selected: boolean, compact = false) =>
  `${compact ? 'min-h-[48px] px-3 py-2.5' : 'min-h-[36px] px-3 py-2'} flex items-center rounded-xl text-body text-left leading-snug border transition-all active:scale-[0.97] touch-manipulation ${
    selected
      ? 'bg-accent/[0.12] border-accent/40 text-ink'
      : 'bg-white/[0.03] border-white/[0.09] text-ink-muted hover:bg-white/[0.06] hover:text-ink'
  }`

// ── Steady: name what is running, take the counter-move ──────────────────────

function SteadyBody({ onAsk, onCompile, compact }: { onAsk: () => void; onCompile: () => void; compact: boolean }) {
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
            className={CHIP(trap?.id === t.id, compact)}
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

function SpeakBody({ compact }: { compact: boolean }) {
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
            className={CHIP(sit?.id === s.id, compact)}
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

function IdeaBody({ compact }: { compact: boolean }) {
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
      {/* Secondary size on purpose: at the lede size this field out-typed the
          section heading above it and wrapped its own placeholder onto two
          lines inside a tool column. The optionality moved into the caption so
          the placeholder is one line. */}
      <VoiceField value={idea} onChange={setIdea} rows={2} size="ui" placeholder="The idea, in one sentence." />
      <p className="-mt-1 text-micro text-ink-faint">Optional. Nothing here is saved. This is a gut check, not a record.</p>

      <div className="grid grid-cols-1 gap-2">
        {DECISION_RULES.map(r => (
          <button
            key={r.id}
            type="button"
            onPointerDown={() => h.select()}
            onClick={() => flip(r.id)}
            className={CHIP(tripped.has(r.id), compact)}
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
