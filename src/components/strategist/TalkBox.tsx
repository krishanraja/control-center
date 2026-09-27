import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Send } from '@/lib/icons'
import { OptionChips } from '../goals/GoalPickers'
import { Working } from '../shared/Working'
import { NOTE_KIND_OPTIONS, inferNoteKind } from '../../lib/strategist'
import type { NoteKind } from '../../types/strategist'
import { useHaptics } from '../../hooks/useHaptics'

// Where Krish says how it is going, in his own words (Krish, 2026-09-27: "a
// plain text box I can dictate into with Wispr Flow"). He uses it on a Monday
// morning, during the week, and at the end of it; what he says becomes
// recommendations, goals and next steps (ADR-026).
//
// The rules are for dictation, which pastes long runs of text into whatever
// field has focus:
//   - A plain <textarea>. No mic of our own competing with his, no rich text,
//     no key handling beyond the one below, so a dictation tool types into it
//     exactly as it would into any field.
//   - Enter is a newline. Cmd/Ctrl+Enter or the button sends.
//   - It grows with what is in it. Nothing he said is ever behind a scrollbar
//     inside the box, and nothing is clipped or counted.
//   - An unsent draft is kept on this device (inside try/catch: storage can be
//     missing or refuse), and cleared only once a read has come back, so a
//     failed run never costs him what he said.

export const TALK_DRAFT_KEY = 'strategist.talk.draft'
export const NOTE_MAX_CHARS = 12_000

const PLACEHOLDER: Record<NoteKind, string> = {
  week_open: 'How do you want this week to go? What matters, what is in the way, who could help.',
  update: 'How is it going? What moved, what stalled, what you keep thinking about.',
  week_close: 'How did the week go? What happened, what did not, and what you would change.',
}

export function readTalkDraft(): string {
  try { return window.localStorage.getItem(TALK_DRAFT_KEY) || '' } catch { return '' }
}

export function writeTalkDraft(text: string): void {
  try {
    if (text.trim()) window.localStorage.setItem(TALK_DRAFT_KEY, text)
    else window.localStorage.removeItem(TALK_DRAFT_KEY)
  } catch { /* no storage on this device: the draft lives only as long as the box */ }
}

export function clearTalkDraft(): void {
  try { window.localStorage.removeItem(TALK_DRAFT_KEY) } catch { /* nothing to clear */ }
}

export function TalkBox({
  hasObjectives,
  kind: preset,
  busy,
  onSend,
  autoFocus = false,
  compact = false,
}: {
  /** Whether this week already has objectives, for the inferred kind. */
  hasObjectives: boolean
  /** Preselects the kind; otherwise it is inferred from the day. */
  kind?: NoteKind | null
  busy: boolean
  /** Send the note. The draft is kept until a read comes back. */
  onSend: (kind: NoteKind, body: string) => void
  autoFocus?: boolean
  /** The ritual's inline box: a little shorter to start with. */
  compact?: boolean
}) {
  const h = useHaptics()
  const [text, setText] = useState(readTalkDraft)
  const [kind, setKind] = useState<NoteKind>(preset ?? inferNoteKind(hasObjectives))
  const [kindTouched, setKindTouched] = useState(Boolean(preset))
  const [problem, setProblem] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  // The inferred kind follows the canon until he picks one himself.
  useEffect(() => {
    if (!kindTouched) setKind(preset ?? inferNoteKind(hasObjectives))
  }, [hasObjectives, preset, kindTouched])

  // A sheet moves focus to its own first control once it has opened, which
  // lands after the textarea's autoFocus. Take it back a frame later, caret at
  // the end, so dictation can start the moment the sheet is up.
  useEffect(() => {
    if (!autoFocus) return
    const id = window.requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const end = el.value.length
      try { el.setSelectionRange(end, end) } catch { /* not a text control yet */ }
    })
    return () => window.cancelAnimationFrame(id)
  }, [autoFocus])

  // Grow with the text: reset first so it shrinks as well as grows.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const change = (v: string) => {
    setText(v)
    if (problem) setProblem(null)
    writeTalkDraft(v)
  }

  const send = () => {
    const body = text.trim()
    if (!body || busy) return
    if (body.length > NOTE_MAX_CHARS) {
      setProblem('That is over 12,000 characters. Split it in two and send each half.')
      h.error()
      return
    }
    h.impactMedium()
    onSend(kind, body)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="talk-box">
      <OptionChips
        label="What is this?"
        options={NOTE_KIND_OPTIONS}
        value={kind}
        onChange={v => { setKind(v as NoteKind); setKindTouched(true) }}
        disabled={busy}
      />
      <label htmlFor="talk-box-input" className="sr-only">Tell Marcus how it is going</label>
      <textarea
        id="talk-box-input"
        ref={ref}
        data-testid="talk-box-input"
        value={text}
        autoFocus={autoFocus}
        rows={compact ? 4 : 7}
        onChange={e => change(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
        }}
        placeholder={PLACEHOLDER[kind]}
        className={`w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 leading-relaxed text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-white/25 ${compact ? 'text-ui min-h-[112px]' : 'text-lede min-h-[176px]'}`}
      />
      {problem && <p className="text-label text-ink-muted leading-relaxed">{problem}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="talk-box-send"
          onClick={send}
          disabled={busy || !text.trim()}
          className="btn-contrast inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-ui font-semibold disabled:opacity-40"
        >
          {busy ? <Working size={13} /> : <Send size={14} />}
          Send to Marcus
        </button>
        <span className="hidden text-micro text-ink-faint min-[900px]:inline">Cmd or Ctrl with Enter sends. Enter is a new line.</span>
      </div>
    </div>
  )
}
