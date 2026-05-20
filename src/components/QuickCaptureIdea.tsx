import React, { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Loader2 } from 'lucide-react'
import { useToast } from './shared/Toast'

/**
 * ⌘+I — capture a content idea from anywhere in the Control Center.
 *
 * The elegant-magic surface: hit the shortcut, type the seed, enter. The
 * idea POSTs to /api/content-ideas which fans through the N8N
 * `Cleo | Content Idea Capture` workflow (extraction + dedupe + insert).
 * The new card animates into the Content lane within ~3s via realtime.
 *
 * Same destination is reachable from Cleo/Agatha bot chats, Layer 1 Signal
 * Inbox drops, OpenClaw workspace `# IDEA:` markers, and Zara signals —
 * all funnelled through one webhook so dedupe and extraction stay consistent.
 */
export function QuickCaptureIdea() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Global hotkey: ⌘+I / Ctrl+I.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'i') {
        // Don't hijack browser default in inputs that already capture it.
        const target = e.target as HTMLElement | null
        if (target && target.tagName === 'INPUT') return
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = async () => {
    const raw = text.trim()
    if (!raw || busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: raw, source_type: 'manual' }),
      })
      if (!r.ok) throw new Error(String(r.status))
      toast('Idea captured — Cleo is enriching it.', 'success')
      setText('')
      setOpen(false)
    } catch {
      toast('Could not capture idea — try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Floating pill — bottom-right, available on every screen. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 px-3 py-2 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 shadow-lg backdrop-blur transition-colors"
        title="Capture content idea (⌘+I)"
      >
        <Sparkles size={14} />
        <span className="text-[12px] font-medium">Capture idea</span>
        <kbd className="text-[10px] font-mono border border-rose-300/30 rounded px-1 py-0.5 bg-rose-500/10">
          ⌘I
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#101013] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 px-5 pt-4 pb-2">
              <Sparkles size={14} className="text-rose-300" />
              <h2 className="text-[13px] font-semibold text-white">Capture content idea</h2>
              <span className="text-[10px] text-white/40 ml-1">Cleo will enrich + dedupe</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto text-white/40 hover:text-white/80"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>

            <div className="px-5 pb-5">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    submit()
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                rows={4}
                placeholder='e.g. "Why senior media leaders are abandoning Substack — platform lock-in is the new creator-economy story"'
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-rose-500/40 resize-none"
              />

              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] text-white/40">
                  Enter to capture · Esc to close
                </p>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !text.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:opacity-40 transition-colors"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Capture
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
