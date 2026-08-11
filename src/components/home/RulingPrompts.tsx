import React, { useCallback, useRef, useState } from 'react'
import { DEFER_CHOICES, type DeferChoice } from '../../lib/taskQueue'
import { Modal } from '../shared/Modal'

/**
 * Shared note / defer prompts for the ruling verbs (Send back, Defer) that the
 * unified queue absorbed from the old Today tab. buildDecisionActions receives
 * `promptNote` / `promptDefer` from here; the overlay renders above whatever
 * surface mounted the hook (DetailSheet or DecisionDeck), both shells.
 */

type ActivePrompt =
  | { type: 'note'; title: string; resolve: (v: string | null) => void }
  | { type: 'defer'; resolve: (v: DeferChoice | null) => void }

export function useRulingPrompts() {
  const [active, setActive] = useState<ActivePrompt | null>(null)
  const [note, setNote] = useState('')
  const activeRef = useRef<ActivePrompt | null>(null)

  const settle = useCallback((value: string | DeferChoice | null) => {
    const a = activeRef.current
    activeRef.current = null
    setActive(null)
    setNote('')
    if (!a) return
    a.resolve(value as never)
  }, [])

  const promptNote = useCallback((title: string) => new Promise<string | null>(resolve => {
    const p: ActivePrompt = { type: 'note', title, resolve }
    activeRef.current = p
    setActive(p)
  }), [])

  const promptDefer = useCallback(() => new Promise<DeferChoice | null>(resolve => {
    const p: ActivePrompt = { type: 'defer', resolve }
    activeRef.current = p
    setActive(p)
  }), [])

  const overlay = active == null ? null : (
    <Modal
      open
      onClose={() => settle(null)}
      title={active.type === 'note' ? 'Send back with a note' : 'Defer this'}
      hideTitle
      overlayClassName="bg-black/60 backdrop-blur-sm"
      className="sm:max-w-md p-4 space-y-3"
    >
        {active.type === 'note' ? (
          <>
            <div className="text-[13px] font-semibold text-white/85">Send back with a note</div>
            <div className="text-[11px] text-white/45 truncate">{active.title}</div>
            <textarea
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="What should the agent change?"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white/85 focus:outline-none focus:border-white/25 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => settle(null)} className="px-3 py-1.5 rounded-lg text-[12px] border border-white/10 text-white/55 hover:text-white/80">Cancel</button>
              <button
                onClick={() => settle(note.trim() || null)}
                disabled={!note.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-white/10 border border-white/15 text-white/90 hover:bg-white/15 disabled:opacity-40"
              >
                Send back
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] font-semibold text-white/85">Defer until</div>
            <div className="flex flex-col gap-2">
              {DEFER_CHOICES.map(c => (
                <button
                  key={c.key}
                  onClick={() => settle(c.key)}
                  className="w-full rounded-xl py-3 text-[13px] font-semibold bg-white/[0.06] text-white/80 border border-white/10 hover:bg-white/[0.1]"
                >
                  {c.label}
                </button>
              ))}
              <button onClick={() => settle(null)} className="w-full rounded-xl py-2.5 text-[12px] text-white/45 hover:text-white/70">Cancel</button>
            </div>
          </>
        )}
    </Modal>
  )

  return { promptNote, promptDefer, overlay }
}
