import React from 'react'
import { useReducedMotion } from './motion'
import { Working } from './Working'

/**
 * DoThisNextHero — the ONE "what do I do next" hero every tab renders through
 * (P-13 / P-22 + the all-tabs consistency mandate). Tabs differ only in the
 * nouns/verbs they feed in; the grammar, layout, tones, and behavior are
 * identical everywhere so the whole app feels like one product.
 *
 * Calm & Anticipatory: while there's something to do, this is the one focal
 * surface — it breathes with a slow mint halo so the eye lands on it without a
 * single hard cue, and the rest of the screen stays still. When the next thing
 * changes, the new instruction rises in rather than snapping. When you're clear,
 * the bar exhales into a quiet, settled state.
 *
 * Device intent: on desktop (orchestrate) the primary action carries a keyboard
 * affordance — this is a command surface you flow through with the keyboard. On
 * mobile (decide) it's a single, thumb-scale tap.
 */
export type HeroTone = 'emerald' | 'violet' | 'sky' | 'amber' | 'neutral'

export interface HeroDescriptor {
  /** Plain-language instruction — WHAT to do. */
  headline: string
  /** Why / how many — the supporting line. */
  sub: string
  /** Primary button label. Omit for a "clear / caught up" state (no button). */
  actionLabel?: string
  /** Icon shown in the badge + button. */
  icon?: React.ReactNode
  tone?: HeroTone
  /** True when there's nothing to do — renders the calm "caught up" state. */
  clear?: boolean
}

const TONE_BG: Record<HeroTone, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/[0.06]',
  violet: 'border-violet-500/25 bg-violet-500/[0.06]',
  sky: 'border-sky-500/30 bg-sky-500/[0.06]',
  amber: 'border-amber-500/30 bg-amber-500/[0.06]',
  neutral: 'border-emerald-500/20 bg-emerald-500/[0.04]',
}

const TONE_BTN: Record<HeroTone, string> = {
  emerald: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30',
  violet: 'bg-violet-500/20 border-violet-400/40 text-violet-100 hover:bg-violet-500/30',
  sky: 'bg-sky-500/20 border-sky-400/40 text-sky-100 hover:bg-sky-500/30',
  amber: 'bg-amber-500/20 border-amber-400/40 text-amber-100 hover:bg-amber-500/30',
  neutral: 'bg-white/[0.06] border-white/15 text-ink-muted hover:bg-white/[0.1]',
}

/**
 * On a phone, a headline longer than this goes without the glyph (the badge
 * and the button's icon). At 360px the badge, the gap and the button's glyph
 * left a long instruction a column about 70px wide, so it wrapped to five lines
 * and pushed everything under it off the screen. The words and the button are
 * unchanged. The rule lives here, not at a call site, so every tab's phone hero
 * gets it (DESIGN_SYSTEM.md, "DoThisNextHero on a phone").
 */
export const NARROW_GLYPH_MAX_CHARS = 32

interface Props {
  descriptor: HeroDescriptor
  /** The one-tap primary action. Omit when `clear` or when using `actionSlot`. */
  onAct?: () => void
  busy?: boolean
  /** Custom action node (e.g. an inline date picker) — replaces the button. */
  actionSlot?: React.ReactNode
  narrow?: boolean
  /**
   * `bar` (default) is the one-line hero every tab renders. `card` is the same
   * hero as a tall card, for a surface whose whole job IS the next move
   * (Growth, one move at a time, 2026-10-04): the headline steps up a size and
   * the action zone is `children` rather than one button, so a move can carry
   * an answer set, a primary and a secondary, or the verdict that replaces
   * them. The card holds still. It does not breathe: there the hero is the
   * screen rather than a cue on it, and nothing on that screen moves on its own.
   */
  layout?: 'bar' | 'card'
  /** Card layout: replaces the "Do this next" line, e.g. the kind and the product. */
  eyebrow?: React.ReactNode
  /** Card layout: a quiet figure at the eyebrow's right, e.g. "1 of 12". */
  meta?: React.ReactNode
  /** Card layout: a strip above everything, e.g. the week's progress. */
  progress?: React.ReactNode
  /** Card layout: the action zone. */
  children?: React.ReactNode
  testId?: string
  /**
   * Bar layout: the evidence, only when asked (Growth's `Why`, for a bar). A
   * quiet "Why this?" sits under the supporting line; pressing it opens this
   * content in place, under the instruction it explains, and pressing it
   * again closes it. Read first, rows second: open on what the evidence MEANS.
   * Omit it and the bar renders exactly as before.
   */
  why?: React.ReactNode
  /** The disclosure's label. Defaults to "Why this?". */
  whyLabel?: string
  /**
   * Bar layout: the action drops UNDER the instruction, full width, instead of
   * beside it. Meant for `narrow`: on a phone a button (or an `actionSlot`
   * pair such as Approve / Reject) beside the text left the headline a column
   * one or two words wide. Stacked, the words get the whole card and the
   * thumb gets a full-width target. Off by default.
   */
  stackAction?: boolean
  /**
   * Bar layout: the primary action is a link, not a call. For a prepared move
   * at a wall (ADR-030) the one press is his own: the Gmail draft, his mail
   * client, the order page. The button renders as an anchor with this href so
   * the browser does the opening; `onAct` still fires on the click for
   * anything that rides along (a clipboard copy, a toast). Off by default.
   */
  primaryHref?: string
  /** Bar layout: a quiet second action after the primary ("See it"). Off by default. */
  secondary?: { label: string; onClick: () => void; testId?: string }
}

const BTN = 'inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors disabled:opacity-50 min-h-[44px] text-body border outline-none focus-visible:ring-2 focus-visible:ring-white/30'

export function DoThisNextHero({ descriptor, onAct, busy, actionSlot, narrow, layout = 'bar', eyebrow, meta, progress, children, testId, why, whyLabel = 'Why this?', stackAction = false, primaryHref, secondary }: Props) {
  const { headline, sub, actionLabel, clear } = descriptor
  const icon = narrow && headline.length > NARROW_GLYPH_MAX_CHARS && layout === 'bar' ? undefined : descriptor.icon
  const tone: HeroTone = descriptor.tone || (clear ? 'neutral' : 'violet')
  const reduced = useReducedMotion()
  const [whyOpen, setWhyOpen] = React.useState(false)
  // A new instruction starts closed: the evidence belongs to the move it explained.
  React.useEffect(() => { setWhyOpen(false) }, [headline])

  if (layout === 'card') {
    return (
      <section
        aria-label="Do this next"
        data-testid={testId}
        className={`relative flex flex-col rounded-3xl border shadow-glass ${TONE_BG[tone]} ${narrow ? 'gap-4 p-4' : 'gap-5 p-6'}`}
      >
        {progress}
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-accent">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow ?? (
              <p className="text-micro font-display font-semibold uppercase tracking-[0.14em] text-accent">Do this next</p>
            )}
          </div>
          {meta}
        </div>
        {/* Keyed on the headline: the next move rises in when he asks for it. */}
        <div key={headline} className={`flex flex-col gap-2 ${reduced ? '' : 'animate-rise'}`}>
          <h2 className={`${narrow ? 'text-title' : 'text-heading'} font-display font-semibold leading-tight tracking-tight text-ink break-words`}>
            {headline}
          </h2>
          {sub && <p className={`${narrow ? 'text-body' : 'text-ui'} leading-snug text-ink-muted break-words`}>{sub}</p>}
        </div>
        {children}
      </section>
    )
  }

  // The active "next" surface breathes; the cleared one exhales once and rests.
  const sectionMotion = clear
    ? (reduced ? '' : 'animate-exhale')
    : (reduced ? 'shadow-glass' : 'animate-focus-halo')

  return (
    <section
      aria-label="Do this next"
      data-testid={testId}
      className={`relative rounded-2xl border ${TONE_BG[tone]} ${narrow ? 'p-3.5' : 'px-5 py-4'} flex ${stackAction ? 'flex-wrap' : ''} items-center gap-3 ${sectionMotion}`}
    >
      {icon && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
          {icon}
        </div>
      )}
      {/* Keyed on the headline so a new "next" gently rises in instead of swapping. */}
      <div key={headline} className={`min-w-0 flex-1 ${reduced ? '' : 'animate-rise'}`}>
        {/* Full accent, not `/70`. Measured at 1440px on paper, the faded
            version rendered 2.96:1 — under the 4.5:1 floor — on the eyebrow of
            the ONE surface this design language calls focal. Mint at full
            strength is 5.2:1 on paper and ~9:1 on obsidian, so nothing is lost
            in the dark by removing the fade. */}
        {!clear && (
          <p className="text-micro font-display font-semibold uppercase tracking-[0.14em] text-accent mb-1">Do this next</p>
        )}
        {/* Wraps, never truncates. The headline is the instruction and it names
            the thing being acted on, so an ellipsis here hides exactly which
            guest or which stage the button below is about to act on. Two lines
            of instruction cost 22px; a wrong action costs the move. */}
        <p className={`${narrow ? 'text-ui' : 'text-lede'} font-display font-semibold text-ink leading-[1.15] tracking-tight break-words`}>
          {headline}
        </p>
        {/* Wraps rather than truncates: the supporting line carries the count
            or the figure, and an ellipsis there hides exactly the number the
            hero exists to state. */}
        <p className="text-label text-ink-faint leading-snug break-words mt-0.5">{sub}</p>
        {why && (
          <>
            <button
              type="button"
              aria-expanded={whyOpen}
              data-testid={testId ? `${testId}-why` : undefined}
              onClick={() => setWhyOpen(o => !o)}
              className="tap-44 mt-1 text-label font-medium text-ink-muted underline decoration-white/20 underline-offset-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
            >
              {whyOpen ? 'Hide why' : whyLabel}
            </button>
            {whyOpen && (
              <div className="mt-2 border-t border-white/[0.08] pt-2 text-body leading-snug text-ink-muted break-words" data-testid={testId ? `${testId}-why-body` : undefined}>
                {why}
              </div>
            )}
          </>
        )}
      </div>
      {!clear && actionSlot && (stackAction ? <div className="basis-full">{actionSlot}</div> : actionSlot)}
      {!clear && !actionSlot && actionLabel && (() => {
        const inner = (
          <>
            {busy ? <Working size={14} /> : icon}
            {actionLabel}
            {/* Desktop is a keyboard-driven command surface: Tab to the action,
                press Enter. Hidden on touch, where it's a single tap. */}
            {!narrow && (
              <kbd className="ml-1 hidden md:inline-block rounded-md border border-white/20 bg-white/[0.08] px-1.5 py-0.5 text-micro font-mono leading-none text-ink-faint">
                ⏎
              </kbd>
            )}
          </>
        )
        const cls = `${stackAction ? 'basis-full justify-center' : 'flex-shrink-0'} ${BTN} ${TONE_BTN[tone]}`
        const external = /^https?:/.test(primaryHref || '')
        const primary = primaryHref ? (
          <a
            href={primaryHref}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            onClick={onAct}
            data-testid={testId ? `${testId}-primary` : undefined}
            className={cls}
          >
            {inner}
          </a>
        ) : (
          <button type="button" onClick={onAct} disabled={busy} data-testid={testId ? `${testId}-primary` : undefined} className={cls}>
            {inner}
          </button>
        )
        if (!secondary) return primary
        return (
          <div className={`${stackAction ? 'basis-full' : 'flex-shrink-0'} flex items-center gap-2`}>
            {primary}
            <button
              type="button"
              onClick={secondary.onClick}
              data-testid={secondary.testId}
              className="tap-44 rounded-xl px-2 text-label font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              {secondary.label}
            </button>
          </div>
        )
      })()}
    </section>
  )
}
