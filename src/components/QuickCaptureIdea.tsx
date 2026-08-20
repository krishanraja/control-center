import React, { useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { Modal } from './shared/Modal'
import { Working } from './shared/Working'

/**
 * Content-idea capture modal. Pure presentation — owner passes open + onClose.
 * POSTs to /api/content-ideas → Cleo enrich/dedupe → realtime card appears in
 * the Content lane within ~3s.
 */
export function ContentIdeaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const submit = async () => {
    const raw = text.trim()
    if (!raw || busy) return
    h.heavy()
    setBusy(true)
    let lastError: string | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch('/api/content-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: raw, source_type: 'manual' }),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const payload = await r.json().catch(() => ({}))
        if (!payload.ok) throw new Error(payload.error || 'unknown error')
        h.success()
        toast('Idea captured. Cleo is enriching it.', 'success')
        setText('')
        onClose()
        setBusy(false)
        return
      } catch (e) {
        lastError = (e as Error).message
        if (attempt === 0) await new Promise(r => setTimeout(r, 1000))
      }
    }
    h.error()
    toast(`Could not capture idea: ${lastError || 'unknown'}`, 'error')
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="center"
      title="Capture content idea"
      hideTitle
      className="max-w-xl top-[12vh] translate-y-0 p-0"
    >
        <header className="flex items-center gap-2 px-5 pt-4 pb-2">
          <Sparkles size={14} className="text-rose-300" />
          <h2 className="text-[13px] font-semibold text-white">Capture content idea</h2>
          <span className="text-[10px] text-white/40 ml-1">Cleo will enrich + dedupe</span>
          <button
            type="button"
            onClick={onClose}
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
            placeholder='e.g. "Why senior media leaders are abandoning Substack: platform lock-in is the new creator-economy story"'
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
              {busy ? <Working size={12} /> : <Sparkles size={12} />}
              Capture
            </button>
          </div>
        </div>
    </Modal>
  )
}

/**
 * ⌘+I — capture a content idea from anywhere in the Control Center.
 *
 * Desktop-only floating pill + the ⌘I global hotkey. Mobile uses
 * CaptureSpeedDial instead.
 */
export function QuickCaptureIdea() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'i') {
        const target = e.target as HTMLElement | null
        if (target && target.tagName === 'INPUT') return
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {/* Floating pill — desktop-only (min-[900px]). Mobile uses CaptureSpeedDial. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-[900px]:flex fixed right-5 bottom-5 z-30 items-center gap-2 px-3 py-2 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 shadow-lg backdrop-blur transition-colors"
        title="Capture content idea (⌘+I)"
      >
        <Sparkles size={14} />
        <span className="text-[12px] font-medium">Capture idea</span>
        <kbd className="text-[10px] font-mono border border-rose-300/30 rounded px-1 py-0.5 bg-rose-500/10">
          ⌘I
        </kbd>
      </button>

      <ContentIdeaModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
