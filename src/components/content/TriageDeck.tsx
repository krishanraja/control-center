import React, { useCallback, useEffect, useRef } from 'react'
import { X, ChevronRight, Maximize2, RotateCcw, CheckCircle2, Layers, LogOut } from 'lucide-react'
import { useCardDeck, type Dir } from '../../hooks/useCardDeck'
import type { useContentTriage } from '../../hooks/useContentTriage'
import { TriageCard } from './TriageCard'
import { reasonsFor } from '../../lib/triageReasons'
import { RejectReasonBar } from '../shared/RejectReasonBar'

interface Props {
  triage: ReturnType<typeof useContentTriage>
  narrow: boolean
  /** True when the full-screen composer is open over the deck — freeze keyboard
   *  and swipe so an arrow key can't advance the card underneath the overlay. */
  paused?: boolean
}

/**
 * TriageDeck — one card at a time over the active backlog. Triage is binary:
 * LEFT = Drop, RIGHT = Send to draft, TAP = Open. There is no research/keep-for-
 * later step here — triage exists to clear the pile by either discarding or
 * promoting into the drafting pipeline. Upstream cards jump straight to drafting;
 * cards already drafting or at a gate open the composer on RIGHT.
 * Pointer swipe + on-screen buttons + arrow keys all drive the same actions, so
 * it works identically on phone and desktop. Only ~3 cards mount at once, which
 * is what makes a 200+ pile cheap instead of browser-crashing.
 */
export function TriageDeck({ triage, narrow, paused }: Props) {
  const { deck, sendToDraft, drop, pendingDrop, chooseDropReason, cancelDrop, open, undo, canUndo, remaining, triagedCount, activeCount, exitTriage } = triage
  const top = deck[0] || null
  const containerRef = useRef<HTMLDivElement>(null)
  const dropReasons = reasonsFor('content_ideas')

  const onCommit = useCallback((dir: Dir) => {
    if (!top) return
    if (dir === 'left') drop(top)
    else sendToDraft(top) // right = send to draft (or open if already drafting/gate)
  }, [top, drop, sendToDraft])

  const { bind, dx, phase, flyOut } = useCardDeck({ cardId: top?.id ?? null, onCommit, disabled: paused })

  // Keep keyboard focus on the deck so arrow keys land here — but NOT while the
  // composer overlay is open (paused), so a key can't act on the card under it.
  useEffect(() => { if (!paused) containerRef.current?.focus() }, [top?.id, paused])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (paused) return
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    // While the drop reason bar is open, the keyboard drives the chips.
    if (pendingDrop) {
      if (e.key === 'Escape') { e.preventDefault(); cancelDrop() }
      else if (e.key === 'Enter') { e.preventDefault(); chooseDropReason(undefined) }
      else {
        const n = parseInt(e.key, 10)
        if (!Number.isNaN(n) && n >= 1 && n <= dropReasons.length) {
          e.preventDefault(); chooseDropReason(dropReasons[n - 1].code)
        }
      }
      return
    }

    if (!top) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); flyOut('left') }
    else if (e.key === 'ArrowRight') { e.preventDefault(); flyOut('right') }
    else if (e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); open(top.id) }
    else if (e.key === 'u' || e.key === 'U') { if (canUndo) { e.preventDefault(); undo() } }
  }

  // Upstream (seeded/researching) → RIGHT promotes to drafting; everything else
  // already has a draft, so RIGHT just opens the composer.
  const upstream = !!top && (top.state === 'seeded' || top.state === 'researching')
  const rightLabel = upstream ? 'To draft' : 'Open'

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
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/85 border border-white/20 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 transition px-3 py-1.5 rounded-lg">
            <LogOut size={13} /> Exit triage
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
                rightIntent={isTop && !upstream ? 'open' : 'advance'}
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

      {/* Reason chip bar — pops after a LEFT swipe (drop); tap a chip to teach Vera */}
      {pendingDrop ? (
        <div className="pt-4 flex-shrink-0">
          <RejectReasonBar
            title="Why drop it?"
            reasons={dropReasons}
            onChoose={(code, text) => chooseDropReason(code, text)}
            onCancel={cancelDrop}
            showNumbers
          />
        </div>
      ) : (
        top && (
          <>
            {/* Control bar */}
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
                aria-label={upstream ? 'Send to drafts' : 'Open in composer'}
                className="flex items-center justify-center w-14 h-14 rounded-full border-2 border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition"
              >
                <ChevronRight size={24} />
              </button>
            </div>

            <p className="text-center text-[11px] text-white/35 mt-2.5 flex-shrink-0">
              {narrow
                ? <>Swipe left to drop · right to {rightLabel.toLowerCase()} · tap to open</>
                : <>← drop · → {rightLabel.toLowerCase()} · ↑ open · U undo</>}
            </p>
          </>
        )
      )}
    </div>
  )
}
