import React, { useCallback, useEffect, useRef } from 'react'
import { X, Check, ChevronRight, Maximize2, CheckCircle2 } from 'lucide-react'
import { useCardDeck, type Dir } from '../../hooks/useCardDeck'
import { SwipeCard } from './SwipeCard'
import { ReasonChipBar } from './ReasonChipBar'
import { WhyBadge } from './WhyBadge'
import { DeckProgressStrip } from './DeckProgressStrip'

export interface ReasonChip { code: string; label: string }

/** A label that can vary per card (e.g. "Enrich ~$0.50" vs "Promote"). */
export type CardLabel<T> = string | ((t: T) => string)

/** What a RIGHT swipe means for this card — only affects the affordance icon. */
export type RightIntent = 'keep' | 'advance' | 'open'

/** Optional override for the middle control (default = Open detail). */
export interface MiddleAction { icon: React.ReactNode; aria: string; onClick: () => void }

interface Props<T> {
  deck: T[]
  getId: (t: T) => string
  /** Card interior for a given item + its stack depth (0 = top). */
  renderBody: (t: T, depth: number) => React.ReactNode
  ariaLabel?: (t: T) => string

  onAccept: (t: T) => void
  onReject: (t: T) => void
  onOpen?: (t: T) => void

  /** Labels for the drag ghosts + control bar; may vary per card. */
  leftLabel?: CardLabel<T>
  rightLabel?: CardLabel<T>
  /** Per-card RIGHT intent — picks the right-button icon (default 'keep' → ✓). */
  rightIntent?: (t: T) => RightIntent
  /** Replace the middle control (default = Open). Return null to fall back to Open. */
  middleAction?: (t: T) => MiddleAction | null

  /** Left-swipe reason buffer (from useSwipeTriage). When set, the chip bar shows. */
  pending: { item: T } | null
  reasonChips?: (t: T) => ReasonChip[]
  /** Where this card came from, so the top card can answer "why am I seeing
   *  this?" without every deck re-implementing the badge. */
  why?: (t: T) => { table: string; row: Record<string, any> } | null
  onChooseReason: (code?: string) => void
  onCancelPending: () => void

  remaining: number
  triagedCount: number
  onExit?: () => void
  exitLabel?: string
  /** Undo affordance in the progress strip (e.g. Content's stage undo). */
  onUndo?: () => void
  canUndo?: boolean

  /** Progress-strip headline, e.g. "Clear the pile". */
  title?: string
  narrow?: boolean
  /** Freeze gestures + keys while an overlay (composer/detail) is open above. */
  paused?: boolean
}

function resolveLabel<T>(label: CardLabel<T> | undefined, t: T | null, fallback: string): string {
  if (t == null) return fallback
  return typeof label === 'function' ? label(t) : (label ?? fallback)
}

/**
 * SwipeDeck — one card at a time over a pile. LEFT = reject (−1, opens a reason
 * bar), RIGHT = accept/advance (+1), UP/TAP = open detail. Pointer swipe, on-screen
 * buttons, and arrow keys all drive the same actions, so it works identically on
 * phone and desktop. Only ~3 cards mount at once, which is what makes a 200-deep
 * pile cheap instead of browser-crashing.
 *
 * The RIGHT action can be context-aware: the host's onAccept branches on the item
 * (e.g. Enrich a raw lead vs Promote a ready one) and `rightLabel`/`rightIntent`
 * may be functions of the top card so the affordance reads correctly. Generalized
 * so Triage, Visibility, Network, Content, and Pipeline share one deck.
 */
export function SwipeDeck<T>({
  deck, getId, renderBody, ariaLabel,
  onAccept, onReject, onOpen,
  leftLabel = 'Skip', rightLabel = 'Keep', rightIntent, middleAction,
  pending, reasonChips, onChooseReason, onCancelPending, why,
  remaining, triagedCount, onExit, exitLabel, onUndo, canUndo,
  title = 'Clear the pile', narrow, paused,
}: Props<T>) {
  const top = deck[0] ?? null
  const containerRef = useRef<HTMLDivElement>(null)

  const onCommit = useCallback((dir: Dir) => {
    if (!top) return
    if (dir === 'left') onReject(top)
    else onAccept(top)
  }, [top, onReject, onAccept])

  const { bind, dx, phase, flyOut } = useCardDeck({
    cardId: top ? getId(top) : null,
    onCommit,
    disabled: paused,
  })

  // Keep keyboard focus on the deck so arrow keys land here — but not while an
  // overlay is open (paused), so a key can't act on the card under it.
  useEffect(() => { if (!paused) containerRef.current?.focus() }, [top && getId(top), paused])

  const chips = pending && reasonChips ? reasonChips(pending.item) : []

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (paused) return
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    // While a reason bar is open, the keyboard drives the chips.
    if (pending) {
      if (e.key === 'Escape') { e.preventDefault(); onCancelPending(); return }
      if (e.key === 'Enter') { e.preventDefault(); onChooseReason(undefined); return }
      const n = parseInt(e.key, 10)
      if (!Number.isNaN(n) && n >= 1 && n <= chips.length) {
        e.preventDefault(); onChooseReason(chips[n - 1].code)
      }
      return
    }

    if (!top) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); flyOut('left') }
    else if (e.key === 'ArrowRight') { e.preventDefault(); flyOut('right') }
    else if ((e.key === 'ArrowUp' || e.key === 'Enter') && onOpen) { e.preventDefault(); onOpen(top) }
    else if ((e.key === 'u' || e.key === 'U') && canUndo && onUndo) { e.preventDefault(); onUndo() }
  }

  const topLeft = resolveLabel(leftLabel, top, 'Skip')
  const topRight = resolveLabel(rightLabel, top, 'Keep')
  const topIntent: RightIntent = top && rightIntent ? rightIntent(top) : 'keep'
  const topMiddle = top && middleAction ? middleAction(top) : null
  const RightIcon = topIntent === 'keep' ? Check : ChevronRight

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`flex flex-col h-full outline-none ${narrow ? 'px-4 pb-[calc(env(safe-area-inset-bottom,0px)+120px)]' : 'px-0'}`}
    >
      <DeckProgressStrip
        title={title}
        remaining={remaining}
        triagedCount={triagedCount}
        onExit={onExit}
        exitLabel={exitLabel}
        onUndo={onUndo}
        canUndo={canUndo}
      />

      {/* Card stage */}
      <div className="relative flex-1 min-h-0 mx-auto w-full max-w-md">
        {top ? (
          deck.slice(0, 3).reverse().map((item) => {
            const depth = deck.indexOf(item)
            const isTop = depth === 0
            return (
              <SwipeCard
                key={getId(item)}
                depth={depth}
                dx={isTop ? dx : 0}
                dragging={isTop && phase === 'dragging'}
                flyout={isTop && phase === 'flyout'}
                leftLabel={isTop ? topLeft : resolveLabel(leftLabel, item, 'Skip')}
                rightLabel={isTop ? topRight : resolveLabel(rightLabel, item, 'Keep')}
                bind={isTop ? bind : undefined}
                ariaLabel={ariaLabel ? ariaLabel(item) : undefined}
                onClick={isTop && onOpen ? () => onOpen(item) : undefined}
              >
                {isTop && why?.(item) ? (
                  <div className="absolute right-3 top-3 z-10">
                    <WhyBadge {...why(item)!} />
                  </div>
                ) : null}
                {renderBody(item, depth)}
              </SwipeCard>
            )
          })
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <CheckCircle2 size={28} className="text-emerald-400/80 mb-3" />
            <p className="text-[15px] text-white/85 font-medium">Pile cleared.</p>
            <p className="text-[12px] text-white/45 mt-1 max-w-xs">
              {triagedCount > 0 ? `You triaged ${triagedCount} this round. ` : ''}
              {'Nothing left to swipe.'}
            </p>
            {onExit && (
              <button type="button" onClick={onExit}
                className="mt-4 text-[12px] font-semibold text-violet-200 border border-violet-400/40 bg-violet-500/15 hover:bg-violet-500/25 rounded-lg px-4 py-2">
                Back to list
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reason chip bar — pops after a LEFT swipe; tap a chip (or Skip) to teach */}
      {pending ? (
        <ReasonChipBar
          chips={chips}
          onChoose={onChooseReason}
          onCancel={onCancelPending}
        />
      ) : (
        top && (
          <>
            {/* Control bar — button parity with the swipe */}
            <div className="flex items-center justify-center gap-3 pt-4 flex-shrink-0">
              <button
                type="button"
                onClick={() => flyOut('left')}
                aria-label={topLeft}
                className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-rose-500/40 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 transition"
              >
                <X size={22} />
              </button>
              {topMiddle ? (
                <button
                  type="button"
                  onClick={topMiddle.onClick}
                  aria-label={topMiddle.aria}
                  className="flex items-center justify-center w-12 h-12 rounded-full border border-sky-400/40 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 active:scale-95 transition"
                >
                  {topMiddle.icon}
                </button>
              ) : onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(top)}
                  aria-label="Open detail"
                  className="flex items-center justify-center w-12 h-12 rounded-full border border-white/15 text-white/70 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition"
                >
                  <Maximize2 size={18} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => flyOut('right')}
                aria-label={topRight}
                className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition"
              >
                <RightIcon size={24} />
              </button>
            </div>
            <p className="text-center text-[11px] text-white/35 mt-2.5 flex-shrink-0">
              {narrow
                ? <>Swipe left to {topLeft.toLowerCase()} · right to {topRight.toLowerCase()}{onOpen ? ' · tap to open' : ''}</>
                : <>← {topLeft.toLowerCase()} · → {topRight.toLowerCase()}{onOpen ? ' · ↑ open' : ''}{canUndo ? ' · U undo' : ''}</>}
            </p>
          </>
        )
      )}
    </div>
  )
}
