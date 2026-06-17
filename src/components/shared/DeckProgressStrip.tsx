import { RotateCcw, Layers } from 'lucide-react'

interface Props {
  /** Headline, e.g. "Clear the pile" / "Handle 1-by-1". */
  title: string
  remaining: number
  triagedCount: number
  onExit?: () => void
  /** Exit affordance copy — "Exit" on mobile, "Exit triage" on Content. */
  exitLabel?: string
  onUndo?: () => void
  canUndo?: boolean
}

/**
 * DeckProgressStrip — the header row above every triage deck: a count of what's
 * left + cleared this round, an optional Undo, and an Exit back to the browse
 * view. Shared by SwipeDeck and the Content TriageDeck so the progress vocabulary
 * reads identically across surfaces.
 */
export function DeckProgressStrip({
  title, remaining, triagedCount, onExit, exitLabel = 'Exit', onUndo, canUndo,
}: Props) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-3 flex-shrink-0">
      <Layers size={14} className="text-violet-300" />
      <span className="text-[12px] text-white/70 font-medium">{title}</span>
      <span className="text-[12px] text-white/40 tabular-nums">· {remaining} left{triagedCount > 0 ? ` · ${triagedCount} cleared` : ''}</span>
      {(canUndo || onExit) && (
        <div className="ml-auto flex items-center gap-1.5">
          {canUndo && onUndo && (
            <button type="button" onClick={onUndo}
              className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-md hover:bg-white/[0.06]">
              <RotateCcw size={12} /> Undo
            </button>
          )}
          {onExit && (
            <button type="button" onClick={onExit}
              className="text-[11px] text-white/45 hover:text-white/80 px-2 py-1 rounded-md hover:bg-white/[0.06]">
              {exitLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
