import React, { useCallback, useEffect, useRef } from 'react'
import { X, ChevronRight, Maximize2, RotateCcw, CheckCircle2, Layers } from 'lucide-react'
import { useCardDeck, type Dir } from '../../hooks/useCardDeck'
import type { useContentTriage } from '../../hooks/useContentTriage'
import { TriageCard } from './TriageCard'

interface Props {
  triage: ReturnType<typeof useContentTriage>
  narrow: boolean
  /** True when the full-screen composer is open over the deck — freeze keyboard
   *  and swipe so an arrow key can't advance the card underneath the overlay. */
  paused?: boolean
}

const ADVANCE_LABEL: Record<string, string> = {
  seeded: 'Research', researching: 'Draft', drafting: 'Review',
}

/**
 * TriageDeck — one card at a time over the active backlog. LEFT = Drop,
 * RIGHT = Advance one stage (or Open at a human gate), UP/TAP = Open the composer.
 * Pointer swipe + on-screen buttons + arrow keys all drive the same actions, so
 * it works identically on phone and desktop. Only ~3 cards mount at once, which
 * is what makes a 200+ pile cheap instead of browser-crashing.
 */
export function TriageDeck({ triage, narrow, paused }: Props) {
  const { deck, advance, drop, open, undo, canUndo, advanceIsGate, remaining, triagedCount, activeCount, exitTriage } = triage
  const top = deck[0] || null
  const containerRef = useRef<HTMLDivElement>(null)

  const onCommit = useCallback((dir: Dir) => {
    if (!top) return
    if (dir === 'left') drop(top)
    else advance(top) // gate states open the composer instead of advancing
  }, [top, drop, advance])

  const { bind, dx, phase, flyOut } = useCardDeck({ cardId: top?.id ?? null, onCommit, disabled: paused })

  // Keep keyboard focus on the deck so arrow keys land here — but NOT while the
  // composer overlay is open (paused), so a key can't act on the card under it.
  useEffect(() => { if (!paused) containerRef.current?.focus() }, [top?.id, paused])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (paused) return
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!top) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); flyOut('left') }
    else if (e.key === 'ArrowRight') { e.preventDefault(); flyOut('right') }
    else if (e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); open(top.id) }
    else if (e.key === 'u' || e.key === 'U') { if (canUndo) { e.preventDefault(); undo() } }
  }

  const gate = top ? advanceIsGate(top.state) : false
  const rightLabel = top ? (ADVANCE_LABEL[top.state] || 'Advance') : 'Advance'

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
        <span className="text-[12px] text-white/70 font-medium">Clear the pile</span>
        <span className="text-[12px] text-white/40 tabular-nums">· {remaining} left{triagedCount > 0 ? ` · ${triagedCount} cleared` : ''}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {canUndo && (
            <button type="button" onClick={undo}
              className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-md hover:bg-white/[0.06]">
              <RotateCcw size={12} /> Undo
            </button>
          )}
          <button type="button" onClick={exitTriage}
            className="text-[11px] text-white/45 hover:text-white/80 px-2 py-1 rounded-md hover:bg-white/[0.06]">
            Exit triage
          </button>
        </div>
      </div>

      {/* Card stage */}
      <div className="relative flex-1 min-h-0 mx-auto w-full max-w-md">
        {top ? (
          deck.slice(0, 3).reverse().map((idea) => {
            const depth = deck.indexOf(idea)
            const isTop = depth === 0
            return (
              <TriageCard
                key={idea.id}
                idea={idea}
                depth={depth}
                dx={isTop ? dx : 0}
                dragging={isTop && phase === 'dragging'}
                flyout={isTop && phase === 'flyout'}
                rightIntent={isTop && gate ? 'open' : 'advance'}
                rightLabel={rightLabel}
                bind={isTop ? bind : undefined}
                onClick={isTop ? () => open(idea.id) : undefined}
              />
            )
          })
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <CheckCircle2 size={28} className="text-emerald-400/80 mb-3" />
            <p className="text-[15px] text-white/85 font-medium">Pile cleared.</p>
            <p className="text-[12px] text-white/45 mt-1 max-w-xs">
              {triagedCount > 0 ? `You triaged ${triagedCount} this round. ` : ''}
              {activeCount > 0 ? `${activeCount} still in the backlog.` : 'Nothing left in flight.'}
            </p>
            <button type="button" onClick={exitTriage}
              className="mt-4 text-[12px] font-semibold text-violet-200 border border-violet-400/40 bg-violet-500/15 hover:bg-violet-500/25 rounded-lg px-4 py-2">
              Back to lanes
            </button>
          </div>
        )}
      </div>

      {/* Control bar */}
      {top && (
        <div className="flex items-center justify-center gap-3 pt-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => flyOut('left')}
            aria-label="Drop this idea"
            className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-rose-500/40 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 transition"
          >
            <X size={22} />
          </button>
          <button
            type="button"
            onClick={() => open(top.id)}
            aria-label="Open in composer"
            className="flex items-center justify-center w-12 h-12 rounded-full border border-white/15 text-white/70 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition"
          >
            <Maximize2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => flyOut('right')}
            aria-label={gate ? 'Open to approve' : `Advance to ${rightLabel.toLowerCase()}`}
            className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      )}

      {top && (
        <p className="text-center text-[11px] text-white/35 mt-2.5 flex-shrink-0">
          {narrow
            ? <>Swipe left to drop · right to {gate ? 'open' : rightLabel.toLowerCase()} · tap to open</>
            : <>← drop · → {gate ? 'open' : rightLabel.toLowerCase()} · ↑ open · U undo</>}
        </p>
      )}
    </div>
  )
}
