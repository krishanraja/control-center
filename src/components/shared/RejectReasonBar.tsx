import { useRef, useState } from 'react'
import { labelForReason, type ReasonChip } from '../../lib/triageReasons'
import type { Likely } from '../../hooks/useLikelyReasons'

// The one "why are you binning this?" bar. Extracted from the v1 triage deck so
// the v1 swipe decks and the v2 weekly queue ask the same question the same way
// and their reason codes cannot drift apart.
//
// The contract that makes it usable one-handed in a coffee queue: a chip IS the
// send. One tap categorises and commits. Typing is the fallback, never the toll
// gate — the note box only exists once you ask for it, and picking a chip after
// typing sends both together.

interface Props {
  /** The question. "Why drop it?" on the idea decks, "Why bin it?" on the week. */
  title: string
  reasons: ReasonChip[]
  /** A chip was tapped (or Skip, which passes no code and lets the caller default). */
  onChoose: (reasonCode?: string, reasonText?: string) => void
  onCancel: () => void
  cancelLabel?: string
  /** Offer the free-text box. Off where a note has nowhere to go. */
  allowNote?: boolean
  /** Number hints (1-9) next to chips. ONLY set this where the caller actually
   *  binds those keys, or the hint promises a shortcut that does nothing. */
  showNumbers?: boolean
  /** Predicted reasons, surfaced above the standard set. Absent or empty is
   *  the normal case and the bar looks exactly as it did without it. */
  likely?: Likely
  className?: string
}

const SOURCE_LINE: Record<string, string> = {
  history: 'From what you binned before.',
  model: 'Predicted from your voice.',
}

export function RejectReasonBar({
  title, reasons, onChoose, onCancel,
  cancelLabel = 'Undo', allowNote = true, showNumbers = false, likely, className = '',
}: Props) {
  const predicted = likely?.reasons?.length ? likely.reasons.slice(0, 3) : []
  const predictedCodes = new Set(predicted.map(p => p.code))
  // A predicted chip and its twin in the standard row would be the same tap
  // twice. The prediction wins the position.
  const rest = reasons.filter(r => !predictedCodes.has(r.code))
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const choose = (code?: string) => onChoose(code, note.trim() || undefined)

  const openNote = () => {
    setNoteOpen(true)
    // Focus after paint so the phone keyboard opens on the same tap.
    requestAnimationFrame(() => noteRef.current?.focus())
  }

  return (
    <div
      role="group"
      aria-label={title}
      className={`rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-white/70 font-medium">{title}</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-[11px] text-white/55 hover:text-white/90 px-2 py-1 rounded-md hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        >
          {cancelLabel}
        </button>
      </div>

      {noteOpen ? (
        <div className="mb-2.5">
          <label htmlFor="reject-note" className="sr-only">Say more about why</label>
          <textarea
            id="reject-note"
            ref={noteRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Say more (optional)"
            className="w-full rounded-lg bg-white/[0.04] border border-white/[0.12] px-3 py-2 text-[13px] text-white/85 placeholder:text-white/30 outline-none focus:border-white/30 resize-none"
          />
          <p className="text-[10.5px] text-white/35 mt-1">Now pick a reason below to send it.</p>
        </div>
      ) : null}

      {predicted.length ? (
        <div className="mb-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-200/60 mb-1.5">
            Likely
          </div>
          <div className="flex flex-wrap gap-1.5">
            {predicted.map(p => (
              <button
                key={p.code}
                type="button"
                onClick={() => choose(p.code)}
                title={p.because || undefined}
                className="text-[12px] min-h-[40px] px-3 py-2 rounded-lg border border-amber-300/35 bg-amber-300/[0.08] text-amber-100/90 hover:bg-amber-300/[0.16] active:scale-95 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-200/70"
              >
                {labelForReason(p.code)}
              </button>
            ))}
          </div>
          {SOURCE_LINE[likely!.source] ? (
            <p className="text-[10.5px] text-white/35 mt-1.5">{SOURCE_LINE[likely!.source]}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {rest.map((c, i) => (
          <button
            key={c.code}
            type="button"
            onClick={() => choose(c.code)}
            className="text-[12px] min-h-[40px] px-3 py-2 rounded-lg border border-white/[0.12] text-white/80 hover:border-white/[0.25] hover:bg-white/[0.05] active:scale-95 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
          >
            {showNumbers && i < 9 ? (
              <span className="hidden md:inline text-white/35 mr-1 tabular-nums">{i + 1}</span>
            ) : null}
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => choose(undefined)}
          className="text-[12px] min-h-[40px] px-3 py-2 rounded-lg text-white/50 hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        >
          Skip
        </button>
      </div>

      {allowNote && !noteOpen ? (
        <button
          type="button"
          onClick={openNote}
          className="mt-2 text-[11px] text-white/45 hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-md"
        >
          + Add a note
        </button>
      ) : null}
    </div>
  )
}
