import React, { useCallback, useEffect, useRef } from 'react'
import { X, Check, Maximize2, CheckCircle2, Layers } from 'lucide-react'
import { useCardDeck, type Dir } from '../../hooks/useCardDeck'
import { SwipeCard } from './SwipeCard'

export interface ReasonChip { code: string; label: string }

interface Props<T> {
  deck: T[]
  getId: (t: T) => string
  /** Card interior for a given item + its stack depth (0 = top). */
  renderBody: (t: T, depth: number) => React.ReactNode
  ariaLabel?: (t: T) => string

  onAccept: (t: T) => void
  onReject: (t: T) => void
  onOpen?: (t: T) => void

  leftLabel?: string
  rightLabel?: string

  /** Left-swipe reason buffer (from useSwipeTriage). When set, the chip bar shows. */
  pending: { item: T } | null
  reasonChips?: (t: T) => ReasonChip[]
  onChooseReason: (code?: string) => void
  onCancelPending: () => void

  remaining: number
  triagedCount: number
  onExit?: () => void

  /** Progress-strip headline, e.g. "Clear the pile". */
  title?: string
  narrow?: boolean
  /** Freeze gestures + keys while an overlay (composer/detail) is open above. */
  paused?: boolean
}

/**
 * SwipeDeck — one card at a time over a pile. LEFT = reject (−1, opens a reason
 * bar), RIGHT = accept (+1), UP/TAP = open detail. Pointer swipe, on-screen
 * buttons, and arrow keys all drive the same actions, so it works identically on
 * phone and desktop. Only ~3 cards mount at once, which is what makes a 200-deep
 * pile cheap instead of browser-crashing. Generalized from the Content tab's
 * TriageDeck so Triage, Visibility, Network, and Content share one deck.
 */
export function SwipeDeck<T>({
  deck, getId, renderBody, ariaLabel,
  onAccept, onReject, onOpen,
  leftLabel = 'Skip', rightLabel = 'Keep',
  pending, reasonChips, onChooseReason, onCancelPending,
  remaining, triagedCount, onExit,
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
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`flex flex-col h-full outline-none ${narrow ? 'px-4 pb-[calc(env(safe-area-inset-bottom,0px)+120px)]' : 'px-0'}`}
    >
      {/* Progress strip */}
      <div className="flex items-center gap-2 pt-1 pb-3 flex-shrink-0">
        <Layers size={14} className="text-violet-300" />
        <span className="text-[12px] text-white/70 font-medium">{title}</span>
        <span className="text-[12px] text-white/40 tabular-nums">· {remaining} left{triagedCount > 0 ? ` · ${triagedCount} cleared` : ''}</span>
        {onExit && (
          <button type="button" onClick={onExit}
            className="ml-auto text-[11px] text-white/45 hover:text-white/80 px-2 py-1 rounded-md hover:bg-white/[0.06]">
            Exit
          </button>
        )}
      </div>

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
                leftLabel={leftLabel}
                rightLabel={rightLabel}
                bind={isTop ? bind : undefined}
                ariaLabel={ariaLabel ? ariaLabel(item) : undefined}
                onClick={isTop && onOpen ? () => onOpen(item) : undefined}
              >
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
        <div className="pt-4 flex-shrink-0">
          <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] text-white/70 font-medium">Why drop it?</span>
              <button type="button" onClick={onCancelPending}
                className="ml-auto text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-md hover:bg-white/[0.06]">
                Undo
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => onChooseReason(c.code)}
                  className="text-[12px] px-2.5 py-1.5 rounded-lg border border-white/[0.12] text-white/80 hover:border-white/[0.25] hover:bg-white/[0.05] transition-colors"
                >
                  <span className="hidden md:inline text-white/35 mr-1 tabular-nums">{i + 1}</span>{c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChooseReason(undefined)}
                className="text-[12px] px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/80"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : (
        top && (
          <>
            {/* Control bar — button parity with the swipe */}
            <div className="flex items-center justify-center gap-3 pt-4 flex-shrink-0">
              <button
                type="button"
                onClick={() => flyOut('left')}
                aria-label={leftLabel}
                className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-rose-500/40 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 transition"
              >
                <X size={22} />
              </button>
              {onOpen && (
                <button
                  type="button"
                  onClick={() => onOpen(top)}
                  aria-label="Open detail"
                  className="flex items-center justify-center w-12 h-12 rounded-full border border-white/15 text-white/70 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition"
                >
                  <Maximize2 size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={() => flyOut('right')}
                aria-label={rightLabel}
                className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition"
              >
                <Check size={24} />
              </button>
            </div>
            <p className="text-center text-[11px] text-white/35 mt-2.5 flex-shrink-0">
              {narrow
                ? <>Swipe left to {leftLabel.toLowerCase()} · right to {rightLabel.toLowerCase()}{onOpen ? ' · tap to open' : ''}</>
                : <>← {leftLabel.toLowerCase()} · → {rightLabel.toLowerCase()}{onOpen ? ' · ↑ open' : ''}</>}
            </p>
          </>
        )
      )}
    </div>
  )
}
